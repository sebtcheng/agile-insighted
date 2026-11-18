import {
  Badge,
  Group,
  Loader,
  Popover,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue, useHotkeys } from "@mantine/hooks";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearch } from "../api/hooks";
import { StatusBadge } from "./ui";

/** Header typeahead. Press `/` anywhere to focus it. */
export function GlobalSearch() {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced] = useDebouncedValue(text.trim(), 250);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const result = useSearch(debounced);

  // `/` focuses search unless the user is already typing in a field.
  useHotkeys(
    [
      [
        "/",
        (e) => {
          e.preventDefault();
          inputRef.current?.focus();
        },
      ],
    ],
    ["INPUT", "TEXTAREA", "SELECT"],
  );

  const close = () => {
    setOpen(false);
    setText("");
  };
  const openActivity = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("activity", id);
    setParams(next);
    close();
  };

  const data = result.data;
  const hasAny =
    !!data && data.activities.length + data.subprojects.length + data.people.length > 0;
  const tooShort = debounced.length > 0 && debounced.length < 3;

  return (
    <Popover
      opened={open && debounced.length > 0}
      width="target"
      position="bottom-start"
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <TextInput
          ref={inputRef}
          aria-label="Search activities, subprojects and people"
          placeholder="Search…  (press /)"
          value={text}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              close();
              inputRef.current?.blur();
            }
          }}
          rightSection={result.isFetching ? <Loader size="xs" /> : null}
          w={{ base: "100%", sm: 380 }}
        />
      </Popover.Target>
      <Popover.Dropdown p="xs" mah={420} style={{ overflowY: "auto" }}>
        {result.isError ? (
          <Text size="sm" c="red">
            Search failed. Try again.
          </Text>
        ) : !data ? (
          <Text size="sm" c="dimmed">
            Searching…
          </Text>
        ) : !hasAny ? (
          <Text size="sm" c="dimmed">
            {tooShort ? "Keep typing: activity search needs 3 characters." : "No matches."}
          </Text>
        ) : (
          <Stack gap="sm">
            {data.activities.length > 0 && (
              <Stack gap={2}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Activities
                </Text>
                {data.activities.map((a) => (
                  <UnstyledButton
                    key={a.id}
                    onMouseDown={() => openActivity(a.id)}
                    p={6}
                    style={{ borderRadius: 4 }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" lineClamp={1}>
                        {a.title}
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        {a.subprojectCode ? (
                          <Badge variant="outline" color="gray">
                            {a.subprojectCode}
                          </Badge>
                        ) : null}
                        <StatusBadge status={a.status} />
                      </Group>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            )}
            {data.subprojects.length > 0 && (
              <Stack gap={2}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Subprojects
                </Text>
                {data.subprojects.map((s) => (
                  <UnstyledButton
                    key={s.id}
                    p={6}
                    onMouseDown={() => {
                      void navigate(`/projects?subprojectId=${s.id}`);
                      close();
                    }}
                  >
                    <Text size="sm">
                      <b>{s.code}</b> {s.name}
                    </Text>
                  </UnstyledButton>
                ))}
              </Stack>
            )}
            {data.people.length > 0 && (
              <Stack gap={2}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  People
                </Text>
                {data.people.map((p) => (
                  <UnstyledButton
                    key={p.id}
                    p={6}
                    onMouseDown={() => {
                      void navigate(`/workload?person=${p.id}`);
                      close();
                    }}
                  >
                    <Text size="sm">{p.fullName}</Text>
                  </UnstyledButton>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
