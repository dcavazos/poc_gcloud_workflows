"""
WhatsApp Proxy Multi-tenant para ChatLLM
Cloud Function que conecta Twilio WhatsApp con múltiples bots de Abacus ChatLLM

Deploy:
    gcloud functions deploy whatsapp-honda-bot \
        --gen2 \
        --runtime=python311 \
        --region=us-central1 \
        --source=. \
        --entry-point=whatsapp_webhook \
        --trigger-http \
        --allow-unauthenticated
"""

import functions_framework
from google.cloud import firestore
from twilio.rest import Client as TwilioClient
import urllib.request
import urllib.error
import urllib.parse
import json
import ssl
import os
from datetime import datetime, timezone

# =============================================================================
# CONFIGURACIÓN
# =============================================================================

MAX_HISTORY_MESSAGES = int(os.environ.get("MAX_HISTORY_MESSAGES", "10"))
SESSION_TIMEOUT_HOURS = int(os.environ.get("SESSION_TIMEOUT_HOURS", "24"))

# Firestore client (inicializado lazy)
_db = None
_twilio_clients = {}  # Cache de clientes Twilio por bot

# SSL context para requests
ssl_context = ssl.create_default_context()


def get_db():
    """Obtiene cliente de Firestore (singleton)."""
    global _db
    if _db is None:
        _db = firestore.Client()
    return _db


def get_twilio_client(account_sid: str, auth_token: str) -> TwilioClient:
    """Obtiene cliente de Twilio (cached por account_sid)."""
    global _twilio_clients
    if account_sid not in _twilio_clients:
        _twilio_clients[account_sid] = TwilioClient(account_sid, auth_token)
    return _twilio_clients[account_sid]


# =============================================================================
# FUNCIONES DE WHATSAPP NUMBER Y BOT
# =============================================================================

def get_whatsapp_number_by_phone(phone_number: str) -> dict:
    """
    Busca un WhatsAppNumber por número de teléfono.

    Args:
        phone_number: Número en formato "whatsapp:+528120854452"

    Returns:
        dict con configuración del WhatsAppNumber o None
    """
    db = get_db()

    numbers_ref = db.collection("whatsappNumbers")
    query = numbers_ref.where("phoneNumber", "==", phone_number).where("status", "==", "active").limit(1)

    docs = list(query.stream())
    if docs:
        return docs[0].to_dict()

    print(f"No WhatsApp number found: {phone_number}")
    return None


def get_bot_by_id(bot_id: str) -> dict:
    """
    Obtiene un bot por su ID.

    Args:
        bot_id: ID del bot

    Returns:
        dict con configuración del bot o None
    """
    db = get_db()
    doc = db.collection("bots").document(bot_id).get()
    if doc.exists:
        return doc.to_dict()
    return None


def get_bot_by_phone(phone_number: str) -> dict:
    """
    Busca un bot por número de teléfono de Twilio.
    DEPRECATED: Use get_whatsapp_number_by_phone instead.
    Kept for backward compatibility.

    Args:
        phone_number: Número en formato "whatsapp:+528120854452"

    Returns:
        dict con configuración del bot o None
    """
    # First try new model
    wa_number = get_whatsapp_number_by_phone(phone_number)
    if wa_number and wa_number.get("defaultBotId"):
        bot = get_bot_by_id(wa_number["defaultBotId"])
        if bot:
            provider = wa_number.get("provider", "twilio")
            bot["provider"] = provider
            bot["whatsappNumberId"] = wa_number.get("id")
            bot["teamId"] = wa_number.get("teamId")

            if provider == "valuetext":
                bot["valuetextSenderId"] = wa_number.get("valuetextSenderId", "")
                # Load org-level Salesforce credentials
                org_id = bot.get("organizationId")
                if org_id:
                    org_doc = get_db().collection("organizations").document(org_id).get()
                    if org_doc.exists:
                        sf_config = org_doc.to_dict().get("salesforceConfig", {})
                        bot["salesforceConfig"] = sf_config
            else:
                # Merge Twilio config from WhatsAppNumber into bot for compatibility
                bot["twilioConfig"] = {
                    "phoneNumber": wa_number.get("phoneNumber"),
                    "accountSid": wa_number.get("twilioAccountSid"),
                    "authToken": wa_number.get("twilioAuthToken"),
                }
            return bot

    # Fallback to old model (search by bot's twilioConfig)
    db = get_db()
    bots_ref = db.collection("bots")
    query = bots_ref.where("twilioConfig.phoneNumber", "==", phone_number).where("status", "==", "active").limit(1)

    docs = list(query.stream())
    if docs:
        return docs[0].to_dict()

    print(f"No bot found for phone: {phone_number}")
    return None


def check_handoff_keywords(message: str, keywords: list) -> bool:
    """Verifica si el mensaje contiene keywords de handoff."""
    message_lower = message.lower()
    for keyword in keywords:
        if keyword.lower() in message_lower:
            return True
    return False


def auto_assign_agent(org_id: str, conv_id: str, team_id: str = None) -> str:
    """
    Asigna automáticamente la conversación al agente con menos carga.

    Args:
        org_id: ID de la organización
        conv_id: ID de la conversación
        team_id: ID del team (si se proporciona, solo busca agentes del team)

    Returns:
        ID del agente asignado o None si no hay agentes disponibles
    """
    db = get_db()
    now = datetime.now(timezone.utc)

    # Obtener maxConversationsPerAgent del team (si existe)
    max_convs = None
    if team_id:
        team_doc = db.collection("teams").document(team_id).get()
        if team_doc.exists:
            max_convs = team_doc.to_dict().get("maxConversationsPerAgent")

    # Buscar agentes disponibles
    users_ref = db.collection("users")

    # Si hay team_id, buscar agentes del team; si no, de la organización
    if team_id:
        query = users_ref.where("teamId", "==", team_id).where("role", "in", ["admin", "agent"])
    else:
        query = users_ref.where("organizationId", "==", org_id).where("role", "in", ["admin", "agent"])

    available_agents = []
    for doc in query.stream():
        agent_data = doc.to_dict()
        # Verificar si está disponible (campo opcional)
        is_available = agent_data.get("isAvailable", True)
        if not is_available:
            continue

        active_convs = agent_data.get("activeConversations", 0)

        # Filtrar agentes que alcanzaron el máximo de conversaciones
        if max_convs is not None and active_convs >= max_convs:
            continue

        available_agents.append({
            "id": doc.id,
            "activeConversations": active_convs
        })

    if not available_agents:
        print(f"No available agents for organization: {org_id}")
        return None

    # Ordenar por número de conversaciones activas (menor primero)
    available_agents.sort(key=lambda x: x["activeConversations"])
    assigned_agent = available_agents[0]

    print(f"Assigning conversation {conv_id} to agent {assigned_agent['id']}")

    # Actualizar conversación con agente asignado
    db.collection("conversations").document(conv_id).update({
        "status": "with_agent",
        "assignedAgentId": assigned_agent["id"],
        "assignedAt": now,
        "handoffReason": "keyword",
        # New Team model fields
        "assignedAgentType": "human",
        "assignedBotId": None,
        "assignedUserId": assigned_agent["id"],
    })

    # Incrementar contador de conversaciones activas del agente
    db.collection("users").document(assigned_agent["id"]).update({
        "activeConversations": firestore.Increment(1),
        "lastActivityAt": now
    })

    return assigned_agent["id"]


# =============================================================================
# FUNCIONES DE CHATLLM API
# =============================================================================

def send_to_chatllm(bot_config: dict, messages: list, firestore_conv_id: str = None) -> dict:
    """
    Envía mensajes al ChatLLM API usando getConversationResponse.
    Este endpoint soporta executeUsercodeTools para ejecutar tools automáticamente.

    Args:
        bot_config: Configuración del bot con abacusConfig
        messages: Lista de mensajes con formato {"is_user": bool, "text": str}
        firestore_conv_id: ID de conversación de Firestore, usado como externalSessionId para mantener contexto en Abacus

    Returns:
        dict con la respuesta del API o error
    """
    abacus = bot_config.get("abacusConfig", {})

    # Obtener el último mensaje del usuario
    last_user_message = ""
    for msg in reversed(messages):
        if msg.get("is_user"):
            last_user_message = msg.get("text", "")
            break

    # Usar getConversationResponse que soporta executeUsercodeTools
    api_url = "https://api.abacus.ai/api/v0/getConversationResponse"

    payload = {
        "deploymentToken": abacus.get("deploymentToken"),
        "deploymentId": abacus.get("deploymentId"),
        "message": last_user_message,
        "executeUsercodeTools": True  # Ejecutar tools automáticamente en Abacus
    }

    # Usar externalSessionId con el ID de Firestore para mantener contexto en Abacus
    if firestore_conv_id:
        payload["externalSessionId"] = firestore_conv_id

    print(f"Sending to getConversationResponse: {json.dumps(payload, ensure_ascii=False)}")

    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        api_url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "WhatsAppProxy/2.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=120, context=ssl_context) as response:
            result = json.loads(response.read().decode("utf-8"))
            print(f"getConversationResponse result: {json.dumps(result, ensure_ascii=False, default=str)[:1000]}")
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"ChatLLM HTTP Error {e.code}: {error_body}")
        return {"error": f"HTTP {e.code}: {error_body}"}
    except urllib.error.URLError as e:
        print(f"ChatLLM URL Error: {e.reason}")
        return {"error": f"URL Error: {e.reason}"}
    except Exception as e:
        print(f"ChatLLM Exception: {str(e)}")
        return {"error": f"Error: {str(e)}"}


def check_handoff_tool_call(api_result: dict) -> dict:
    """
    Verifica si el ChatLLM llamó al tool Transferir_a_Asesor.

    Returns:
        dict con {"triggered": True, "motivo": "..."} si se detectó handoff,
        {"triggered": False} si no.
    """
    try:
        if not api_result.get("success") or "result" not in api_result:
            return {"triggered": False}

        result = api_result["result"]

        # Buscar en toolResults si existe
        tool_results = result.get("toolResults", [])
        for tool_result in tool_results:
            tool_name = tool_result.get("toolName", "")
            if tool_name == "Transferir_a_Asesor":
                print(f"Handoff tool detected: {tool_result}")
                # Extraer motivo del input o output del tool
                tool_input = tool_result.get("input", {})
                motivo = tool_input.get("motivo", "solicitado por el agente")
                return {"triggered": True, "motivo": motivo}

        # También buscar en la respuesta si contiene indicadores de handoff
        response = result.get("response", "")
        if '"action": "HANDOFF"' in response or '"action":"HANDOFF"' in response:
            print("Handoff detected in response text")
            return {"triggered": True, "motivo": "detectado en respuesta"}

        return {"triggered": False}
    except Exception as e:
        print(f"Error checking handoff tool: {str(e)}")
        return {"triggered": False}


def extract_bot_response(api_result: dict) -> str:
    """Extrae el texto de respuesta del bot del resultado del API."""
    if "error" in api_result:
        return "Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo."

    try:
        if api_result.get("success") and "result" in api_result:
            result = api_result["result"]

            # Formato getConversationResponse: result tiene "response" directamente
            if "response" in result:
                return result.get("response", "Sin respuesta disponible")

            # Formato chatLLM: result tiene "messages" array
            messages = result.get("messages", [])
            for msg in reversed(messages):
                if not msg.get("is_user", True):
                    return msg.get("text", "Sin respuesta disponible")

        return "No se encontró respuesta del bot"
    except Exception as e:
        print(f"Error parsing response: {str(e)}")
        return "Error procesando la respuesta. Por favor intenta de nuevo."


# =============================================================================
# FUNCIONES DE CONVERSACIÓN
# =============================================================================

def normalize_phone(phone: str) -> str:
    """Normaliza número de teléfono para usar como ID."""
    return "".join(c for c in phone if c.isdigit() or c == "+")


def get_or_create_conversation(bot_id: str, org_id: str, customer_phone: str,
                               team_id: str = None, whatsapp_number_id: str = None) -> tuple:
    """
    Obtiene o crea una conversación para un cliente.

    Returns:
        (conversation_id, conversation_data, messages_list)
    """
    db = get_db()
    phone_normalized = normalize_phone(customer_phone)

    # Buscar conversación existente no cerrada
    convs_ref = db.collection("conversations")
    query = convs_ref.where("botId", "==", bot_id).where("customerPhone", "==", customer_phone).where("status", "in", ["bot", "waiting_agent", "with_agent"]).limit(1)

    docs = list(query.stream())

    if docs:
        conv = docs[0]
        conv_data = conv.to_dict()

        # Verificar expiración (24 horas)
        last_activity = conv_data.get("lastMessageAt")
        if last_activity:
            if hasattr(last_activity, "timestamp"):
                last_activity = datetime.fromtimestamp(last_activity.timestamp(), tz=timezone.utc)
            hours_diff = (datetime.now(timezone.utc) - last_activity).total_seconds() / 3600

            if hours_diff >= SESSION_TIMEOUT_HOURS:
                # Cerrar conversación antigua y crear nueva
                conv.reference.update({"status": "closed"})
                return create_new_conversation(db, bot_id, org_id, customer_phone, team_id, whatsapp_number_id)

        # Obtener mensajes
        messages_docs = conv.reference.collection("messages").order_by("createdAt").stream()
        messages = [{"is_user": m.to_dict()["sender"] == "customer", "text": m.to_dict()["text"]} for m in messages_docs]

        return conv.id, conv_data, messages

    return create_new_conversation(db, bot_id, org_id, customer_phone, team_id, whatsapp_number_id)


def create_new_conversation(db, bot_id: str, org_id: str, customer_phone: str,
                            team_id: str = None, whatsapp_number_id: str = None) -> tuple:
    """Crea una nueva conversación."""
    now = datetime.now(timezone.utc)

    conv_ref = db.collection("conversations").document()
    conv_data = {
        "id": conv_ref.id,
        "botId": bot_id,
        "organizationId": org_id,
        "customerPhone": customer_phone,
        "customerName": None,
        "status": "bot",
        "assignedAgentId": None,
        "priority": "normal",
        "tags": [],
        "lastMessageAt": now,
        "createdAt": now,
        "abacusConversationId": None,  # Se llena con el ID de Abacus en la primera respuesta
        # New Team model fields
        "teamId": team_id,
        "whatsappNumberId": whatsapp_number_id,
        "assignedAgentType": "bot",  # "bot" | "human" | None
        "assignedBotId": bot_id,
        "assignedUserId": None,
    }
    conv_ref.set(conv_data)

    return conv_ref.id, conv_data, []


def update_abacus_conversation_id(conv_id: str, abacus_conv_id: str):
    """Actualiza el conversationId de Abacus en la conversación."""
    db = get_db()
    db.collection("conversations").document(conv_id).update({
        "abacusConversationId": abacus_conv_id
    })


def add_message(conv_id: str, sender: str, text: str, agent_id: str = None):
    """Agrega un mensaje a la conversación."""
    db = get_db()
    now = datetime.now(timezone.utc)

    # Agregar mensaje
    msg_ref = db.collection("conversations").document(conv_id).collection("messages").document()
    msg_ref.set({
        "id": msg_ref.id,
        "conversationId": conv_id,
        "sender": sender,  # "customer", "bot", "agent"
        "agentId": agent_id,
        "text": text,
        "mediaUrl": None,
        "createdAt": now
    })

    # Actualizar lastMessageAt en conversación
    db.collection("conversations").document(conv_id).update({
        "lastMessageAt": now
    })


def update_conversation_status(conv_id: str, status: str):
    """Actualiza el status de una conversación."""
    db = get_db()
    db.collection("conversations").document(conv_id).update({
        "status": status
    })


def send_whatsapp_message(bot_config: dict, to_number: str, from_number: str, message: str):
    """Envía un mensaje de WhatsApp usando las credenciales del bot."""
    provider = bot_config.get("provider", "twilio")

    if provider == "valuetext":
        return send_salesforce_message(bot_config, to_number, message)
    else:
        return send_twilio_message(bot_config, to_number, from_number, message)


def send_twilio_message(bot_config: dict, to_number: str, from_number: str, message: str):
    """Envía un mensaje via Twilio."""
    twilio_config = bot_config.get("twilioConfig", {})

    try:
        client = get_twilio_client(
            twilio_config.get("accountSid"),
            twilio_config.get("authToken")
        )
        msg = client.messages.create(
            body=message,
            from_=from_number,
            to=to_number
        )
        print(f"Twilio message sent: {msg.sid}")
        return msg.sid
    except Exception as e:
        print(f"Error sending Twilio message: {str(e)}")
        return None


def send_salesforce_message(bot_config: dict, to_number: str, message: str):
    """Envía un mensaje insertando SMS_Bucket__c en Salesforce (ValueText lo recoge)."""
    sf_config = bot_config.get("salesforceConfig", {})
    sender_id = bot_config.get("valuetextSenderId", "")

    instance_url = sf_config.get("instanceUrl", "")
    client_id = sf_config.get("clientId", "")
    client_secret = sf_config.get("clientSecret", "")
    username = sf_config.get("username", "")
    password = sf_config.get("password", "")

    if not instance_url or not client_id or not client_secret or not username or not password:
        print("Salesforce credentials not configured")
        return None

    # 1. Get access token via username-password flow
    token_params = urllib.parse.urlencode({
        "grant_type": "password",
        "client_id": client_id,
        "client_secret": client_secret,
        "username": username,
        "password": password,
    })

    token_req = urllib.request.Request(
        f"{instance_url}/services/oauth2/token",
        data=token_params.encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(token_req, timeout=30, context=ssl_context) as token_response:
            token_data = json.loads(token_response.read().decode("utf-8"))
            access_token = token_data.get("access_token")
    except Exception as e:
        print(f"Error getting Salesforce access token: {str(e)}")
        return None

    # 2. Insert SMS_Bucket__c record
    mobile_number = to_number.replace("whatsapp:", "")

    record = json.dumps({
        "rsplus__Number__c": mobile_number,
        "rsplus__Message__c": message,
        "rsplus__Sender_ID__c": sender_id,
    }).encode("utf-8")

    insert_req = urllib.request.Request(
        f"{instance_url}/services/data/v59.0/sobjects/rsplus__SMS_Bucket__c/",
        data=record,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(insert_req, timeout=30, context=ssl_context) as sf_response:
            result = sf_response.read().decode("utf-8")
            print(f"Salesforce SMS_Bucket inserted: {result}")
            return result
    except Exception as e:
        print(f"Error inserting Salesforce SMS_Bucket: {str(e)}")
        return None


# =============================================================================
# CLOUD FUNCTION ENTRY POINT
# =============================================================================

@functions_framework.http
def whatsapp_webhook(request):
    """
    Entry point para webhook de Twilio WhatsApp (Multi-tenant).

    1. Busca el bot por número de Twilio
    2. Obtiene/crea conversación
    3. Verifica handoff keywords
    4. Si status=bot, envía a ChatLLM
    5. Si status=with_agent, no responde (agente responde desde portal)
    6. Guarda mensajes en Firestore
    """
    print(f"Request method: {request.method}")

    if request.method != "POST":
        return "OK", 200

    # Datos de Twilio
    from_number = request.form.get("From", "")
    to_number = request.form.get("To", "")
    message_body = request.form.get("Body", "").strip()

    print(f"From: {from_number}, To: {to_number}, Body: {message_body}")

    if not from_number or not message_body:
        print("Missing from_number or message_body")
        return "", 200

    # 1. Buscar bot por número
    bot = get_bot_by_phone(to_number)
    if not bot:
        print(f"No active bot for number: {to_number}")
        return "", 200

    bot_id = bot.get("id")
    org_id = bot.get("organizationId")
    team_id = bot.get("teamId")  # From WhatsAppNumber or Bot
    whatsapp_number_id = bot.get("whatsappNumberId")  # From get_bot_by_phone
    print(f"Bot found: {bot_id}, teamId: {team_id}")

    # 2. Obtener o crear conversación
    conv_id, conv_data, messages = get_or_create_conversation(
        bot_id, org_id, from_number, team_id, whatsapp_number_id
    )
    print(f"Conversation: {conv_id}, status: {conv_data.get('status')}, messages: {len(messages)}")

    # 3. Guardar mensaje del cliente
    add_message(conv_id, "customer", message_body)
    messages.append({"is_user": True, "text": message_body})

    # 4. Verificar handoff keywords
    handoff_config = bot.get("handoffConfig", {})
    if handoff_config.get("enabled") and check_handoff_keywords(message_body, handoff_config.get("triggerKeywords", [])):
        print("Handoff triggered by keyword")

        # Intentar auto-asignar a un agente (usar team_id para buscar solo agentes del equipo)
        assigned_agent_id = auto_assign_agent(org_id, conv_id, team_id)

        if assigned_agent_id:
            handoff_message = "Entendido, te comunico con un asesor. Un agente ha sido asignado y te atenderá en breve."
        else:
            # No hay agentes disponibles, poner en espera
            update_conversation_status(conv_id, "waiting_agent")
            handoff_message = "Entendido, te comunico con un asesor. En un momento te atenderán."

        add_message(conv_id, "bot", handoff_message)
        send_whatsapp_message(bot, from_number, to_number, handoff_message)
        return "", 200

    # 5. Verificar status de conversación
    status = conv_data.get("status", "bot")

    if status == "with_agent":
        # No responder, el agente responde desde el portal
        print("Conversation with agent, not responding")
        return "", 200

    if status == "waiting_agent":
        # Mensaje de espera
        waiting_message = "Tu mensaje fue recibido. Un asesor te atenderá pronto."
        add_message(conv_id, "bot", waiting_message)
        send_whatsapp_message(bot, from_number, to_number, waiting_message)
        return "", 200

    # 6. Enviar a ChatLLM (status = "bot")
    # Limitar historial
    if len(messages) > MAX_HISTORY_MESSAGES * 2:
        messages = messages[-(MAX_HISTORY_MESSAGES * 2):]

    print("Sending to ChatLLM...")
    print(f"Messages being sent: {json.dumps(messages, ensure_ascii=False)}")

    # Usar conv_id de Firestore como externalSessionId para mantener contexto en Abacus
    print(f"Using Firestore conv_id as externalSessionId: {conv_id}")
    api_result = send_to_chatllm(bot, messages, firestore_conv_id=conv_id)
    print(f"ChatLLM full response: {json.dumps(api_result, ensure_ascii=False, default=str)[:2000]}")
    print(f"ChatLLM response success: {api_result.get('success', False)}")

    # 7. Verificar si el ChatLLM solicitó handoff via tool
    handoff_check = check_handoff_tool_call(api_result)
    if handoff_check.get("triggered"):
        print(f"Handoff triggered by ChatLLM tool: {handoff_check.get('motivo')}")

        # Extraer respuesta del bot (mensaje de despedida del ChatLLM)
        bot_response = extract_bot_response(api_result)

        # Guardar respuesta del bot
        add_message(conv_id, "bot", bot_response)
        send_whatsapp_message(bot, from_number, to_number, bot_response)

        # Intentar auto-asignar a un agente (usar team_id para buscar solo agentes del equipo)
        assigned_agent_id = auto_assign_agent(org_id, conv_id, team_id)

        if assigned_agent_id:
            # Actualizar con el motivo del handoff y campos de agente
            db = get_db()
            db.collection("conversations").document(conv_id).update({
                "handoffReason": handoff_check.get("motivo", "tool_call"),
                "assignedAgentType": "human",
                "assignedBotId": None,
                "assignedUserId": assigned_agent_id,
            })
        else:
            # No hay agentes disponibles, poner en espera
            update_conversation_status(conv_id, "waiting_agent")

        return "", 200

    bot_response = extract_bot_response(api_result)
    print(f"Bot response length: {len(bot_response)}")

    # 8. Guardar respuesta del bot
    add_message(conv_id, "bot", bot_response)

    # 9. Enviar respuesta via WhatsApp (Twilio o ValueText según provider)
    send_whatsapp_message(bot, from_number, to_number, bot_response)

    return "", 200


# =============================================================================
# VALUETEXT WEBHOOK ENTRY POINT
# =============================================================================

@functions_framework.http
def valuetext_webhook(request):
    """
    Entry point para webhook de ValueText WhatsApp.

    Deploy:
        gcloud functions deploy valuetext-webhook \
            --gen2 --runtime=python311 --region=us-central1 \
            --entry-point=valuetext_webhook --trigger-http --allow-unauthenticated

    La URL resultante se configura en el panel de ValueText como webhook de mensajes entrantes.
    """
    print(f"ValueText webhook - method: {request.method}")

    if request.method != "POST":
        return "OK", 200

    # Log full payload for debugging (ValueText docs are sparse)
    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}

    print(f"ValueText webhook payload: {json.dumps(payload, ensure_ascii=False, default=str)}")

    # Extract fields (adjust names after verifying real payload)
    from_number = payload.get("from", "") or payload.get("mobileNumber", "")
    to_number = payload.get("to", "") or payload.get("senderId", "")
    message_body = (payload.get("body", "") or payload.get("sms", "") or payload.get("message", "")).strip()

    print(f"ValueText - From: {from_number}, To: {to_number}, Body: {message_body}")

    if not from_number or not message_body:
        print("ValueText webhook: missing from or message")
        return "", 200

    # Normalize phone numbers to whatsapp:+XXXX format
    if not from_number.startswith("whatsapp:"):
        if not from_number.startswith("+"):
            from_number = f"+{from_number}"
        from_number = f"whatsapp:{from_number}"

    if to_number and not to_number.startswith("whatsapp:"):
        if not to_number.startswith("+"):
            to_number = f"+{to_number}"
        to_number = f"whatsapp:{to_number}"

    # Reuse existing logic: find bot by phone, get/create conversation, process
    bot = get_bot_by_phone(to_number)
    if not bot:
        print(f"ValueText: no active bot for number: {to_number}")
        return "", 200

    bot_id = bot.get("id")
    org_id = bot.get("organizationId")
    team_id = bot.get("teamId")
    whatsapp_number_id = bot.get("whatsappNumberId")
    print(f"ValueText - Bot found: {bot_id}, teamId: {team_id}")

    # Get or create conversation
    conv_id, conv_data, messages = get_or_create_conversation(
        bot_id, org_id, from_number, team_id, whatsapp_number_id
    )
    print(f"ValueText - Conversation: {conv_id}, status: {conv_data.get('status')}")

    # Save customer message
    add_message(conv_id, "customer", message_body)
    messages.append({"is_user": True, "text": message_body})

    # Check handoff keywords
    handoff_config = bot.get("handoffConfig", {})
    if handoff_config.get("enabled") and check_handoff_keywords(message_body, handoff_config.get("triggerKeywords", [])):
        print("ValueText: handoff triggered by keyword")

        assigned_agent_id = auto_assign_agent(org_id, conv_id, team_id)

        if assigned_agent_id:
            handoff_message = "Entendido, te comunico con un asesor. Un agente ha sido asignado y te atenderá en breve."
        else:
            update_conversation_status(conv_id, "waiting_agent")
            handoff_message = "Entendido, te comunico con un asesor. En un momento te atenderán."

        add_message(conv_id, "bot", handoff_message)
        send_whatsapp_message(bot, from_number, to_number, handoff_message)
        return "", 200

    # Check conversation status
    status = conv_data.get("status", "bot")

    if status == "with_agent":
        print("ValueText: conversation with agent, not responding")
        return "", 200

    if status == "waiting_agent":
        waiting_message = "Tu mensaje fue recibido. Un asesor te atenderá pronto."
        add_message(conv_id, "bot", waiting_message)
        send_whatsapp_message(bot, from_number, to_number, waiting_message)
        return "", 200

    # Send to ChatLLM (status = "bot")
    if len(messages) > MAX_HISTORY_MESSAGES * 2:
        messages = messages[-(MAX_HISTORY_MESSAGES * 2):]

    print("ValueText: sending to ChatLLM...")
    api_result = send_to_chatllm(bot, messages, firestore_conv_id=conv_id)

    # Check handoff tool call
    handoff_check = check_handoff_tool_call(api_result)
    if handoff_check.get("triggered"):
        print(f"ValueText: handoff triggered by ChatLLM tool: {handoff_check.get('motivo')}")

        bot_response = extract_bot_response(api_result)
        add_message(conv_id, "bot", bot_response)
        send_whatsapp_message(bot, from_number, to_number, bot_response)

        assigned_agent_id = auto_assign_agent(org_id, conv_id, team_id)

        if assigned_agent_id:
            db = get_db()
            db.collection("conversations").document(conv_id).update({
                "handoffReason": handoff_check.get("motivo", "tool_call"),
                "assignedAgentType": "human",
                "assignedBotId": None,
                "assignedUserId": assigned_agent_id,
            })
        else:
            update_conversation_status(conv_id, "waiting_agent")

        return "", 200

    bot_response = extract_bot_response(api_result)
    print(f"ValueText: bot response length: {len(bot_response)}")

    add_message(conv_id, "bot", bot_response)
    send_whatsapp_message(bot, from_number, to_number, bot_response)

    return "", 200
