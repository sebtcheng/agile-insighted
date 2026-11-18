import { Center, Loader } from "@mantine/core";
import { createContext, useContext, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { MeDto } from "@myapp/shared";
import { useMe } from "./api/hooks";

type User = MeDto["user"];
const AuthContext = createContext<User | null>(null);

/** Protected routes render inside this; a signed-out visitor is sent to /login and returned afterwards. */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!me.data)
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  return <AuthContext.Provider value={me.data}>{children}</AuthContext.Provider>;
}

export function useAuth(): User {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useAuth must be used inside AuthGate");
  return user;
}

export const useIsPm = (): boolean => useAuth().role === "pm";
