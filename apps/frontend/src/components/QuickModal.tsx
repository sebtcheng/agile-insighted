import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";

export type QuickField = {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "select" | "number" | "date";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  description?: string;
};

/** A small create/edit dialog driven by a field list; values come back as trimmed strings. */
export function QuickModal({
  opened,
  title,
  fields,
  initial,
  submitLabel = "Save",
  pending,
  onClose,
  onSubmit,
}: {
  opened: boolean;
  title: string;
  fields: QuickField[];
  initial?: Record<string, string>;
  submitLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const form = useForm<Record<string, string>>({
    initialValues: Object.fromEntries(fields.map((f) => [f.key, initial?.[f.key] ?? ""])),
    validate: Object.fromEntries(
      fields
        .filter((f) => f.required)
        .map((f) => [f.key, (v: string) => (v.trim() ? null : `Enter ${f.label.toLowerCase()}`)]),
    ),
  });
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <form
        onSubmit={form.onSubmit((v) =>
          onSubmit(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()]))),
        )}
      >
        <Stack>
          {fields.map((f, i) =>
            f.kind === "select" ? (
              <Select
                key={f.key}
                label={f.label}
                description={f.description}
                data={f.options ?? []}
                clearable={!f.required}
                {...form.getInputProps(f.key)}
              />
            ) : f.kind === "textarea" ? (
              <Textarea
                key={f.key}
                label={f.label}
                description={f.description}
                autosize
                minRows={2}
                data-autofocus={i === 0 ? true : undefined}
                {...form.getInputProps(f.key)}
              />
            ) : (
              <TextInput
                key={f.key}
                label={f.label}
                description={f.description}
                type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                data-autofocus={i === 0 ? true : undefined}
                {...form.getInputProps(f.key)}
              />
            ),
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
