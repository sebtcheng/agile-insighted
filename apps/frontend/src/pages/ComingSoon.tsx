import { Center, Stack, Text } from "@mantine/core";
import { PageHeader } from "../components/ui";

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Center py="xl">
        <Stack align="center" gap={4}>
          <Text fw={600}>Coming soon</Text>
          <Text c="dimmed" size="sm">
            The data layer for this module is ready; the screens are built in a later phase.
          </Text>
        </Stack>
      </Center>
    </>
  );
}
