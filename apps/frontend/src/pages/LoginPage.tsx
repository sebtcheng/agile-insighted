import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zodResolver } from "mantine-form-zod-resolver";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { loginSchema } from "@myapp/shared";
import { errorMessage } from "../api/client";
import { useLogin, useMe } from "../api/hooks";

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const form = useForm({
    initialValues: { email: "", password: "" },
    validate: zodResolver(loginSchema),
  });

  if (me.data) return <Navigate to={from} replace />;

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w={380} maw="100%">
        <form
          onSubmit={form.onSubmit((values) =>
            login.mutate(values, {
              onSuccess: () => {
                void navigate(from, { replace: true });
              },
            }),
          )}
        >
          <Stack>
            <div>
              <Title order={2}>Sign in</Title>
              <Text c="dimmed" size="sm">
                InsightED AGILE
              </Text>
            </div>
            {login.isError ? (
              <Alert color="red" role="alert">
                {errorMessage(login.error)}
              </Alert>
            ) : null}
            <TextInput
              label="Email"
              autoComplete="username"
              data-autofocus
              {...form.getInputProps("email")}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              {...form.getInputProps("password")}
            />
            <Button type="submit" loading={login.isPending}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
