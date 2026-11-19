import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeDto } from "@myapp/shared";
import { ApiClientError, api } from "./client";

// ---------------------------------------------------------------- auth
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return (await api.get<MeDto>("/auth/me")).user;
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

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.clear();
    },
  });
}
