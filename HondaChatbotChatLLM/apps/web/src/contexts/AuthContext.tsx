"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

interface UserData {
  id: string;
  email: string;
  name: string;
  photoURL: string | null;
  role: "admin" | "agent" | "viewer";
  organizationId: string | null;
  status: "online" | "away" | "offline";
  createdAt: Date;
  lastLoginAt: Date | null;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          // Existing user — update lastLoginAt and status
          await setDoc(userRef, { lastLoginAt: new Date(), status: "online" }, { merge: true });
          const updated = { ...userSnap.data(), lastLoginAt: new Date(), status: "online" } as UserData;
          setUserData(updated);
        } else {
          // No doc by uid — check if pre-registered by email (invite flow)
          const emailQuery = query(
            collection(db, "users"),
            where("email", "==", firebaseUser.email)
          );
          const emailSnap = await getDocs(emailQuery);

          if (!emailSnap.empty) {
            // Found a pre-registered doc — migrate it to the uid-keyed doc
            const oldDoc = emailSnap.docs[0];
            const oldData = oldDoc.data();

            const migratedData = {
              ...oldData,
              id: firebaseUser.uid,
              name: firebaseUser.displayName || oldData.name || "",
              photoURL: firebaseUser.photoURL ?? oldData.photoURL,
              status: "online",
              lastLoginAt: new Date(),
            };

            await setDoc(userRef, migratedData);
            await deleteDoc(doc(db, "users", oldDoc.id));
            setUserData(migratedData as UserData);
          } else {
            // Brand new user — create doc
            const newUserData: UserData = {
              id: firebaseUser.uid,
              email: firebaseUser.email || "",
              name: firebaseUser.displayName || "",
              photoURL: firebaseUser.photoURL,
              role: "viewer",
              organizationId: null,
              status: "online",
              createdAt: new Date(),
              lastLoginAt: new Date(),
            };
            await setDoc(userRef, newUserData);
            setUserData(newUserData);
          }
        }
      } else {
        setUserData(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Update user status to offline before signing out
      if (user) {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { status: "offline" }, { merge: true });
      }
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, userData, loading, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
