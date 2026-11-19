import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeDto, UserDto } from "@myapp/shared";
import { ApiClientError, api } from "./client";

// ---------------------------------------------------------------- auth
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const me = await api.get<MeDto>("/auth/me");
        return { ...me.user, isSimulating: me.isSimulating, realUser: me.realUser };
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; password: string }) => api.post("/auth/login", v),
    // A different user may sign in on the same tab: drop everything cached for the previous session.
    onSuccess: async () => {
      qc.clear();
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useSimulationCandidates(enabled: boolean) {
  return useQuery({
    queryKey: ["simulation-candidates"],
    enabled,
    queryFn: async () => (await api.get<{ items: UserDto[] }>("/auth/simulation/candidates")).items,
  });
}

/** Starting or exiting swaps the effective user, so every cached query is dropped and `me` refetched. */
function useSimulationSwitch<V>(call: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: async () => {
      qc.clear();
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export const useStartSimulation = () =>
  useSimulationSwitch((userId: string) => api.post("/auth/simulation", { userId }));
export const useExitSimulation = () =>
  useSimulationSwitch(() => api.post("/auth/simulation/exit"));

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.clear();
    },
  });
}
