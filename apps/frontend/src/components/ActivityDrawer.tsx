import {
  Alert,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Progress,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Timeline,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useState } from "react";
import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  ENUM_LABELS,
  TRACKS,
  WORK_TYPES,
  type ActivityDto,
  type ActivityEventDto,
  type UpdateActivityInput,
} from "@myapp/shared";
import {
  useActivities,
  useActivity,
  useAddComment,
  useAddDependency,
  useChecklist,
  useComments,
  useDependencies,
  useEvents,
  useReleases,
  useStoryMap,
  useRemoveDependency,
  useSearch,
  useSetCheck,
  useSprints,
  useSubprojects,
  useUsers,
} from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import {
  PriorityBadge,
  QueryState,
  StatusBadge,
  WorkTypeBadge,
  fmtDate,
  fmtDateTime,
  toast,
} from "./ui";
import { useGovernedUpdate } from "./useGovernedUpdate";
import { SideModal } from "./SideModal";

const NONE = "__none__";
const opt = (id: string | null | undefined) => id ?? NONE;
const unopt = (v: string | null) => (v === NONE || v === null ? null : v);

export function ActivityDrawer({
  activityId,
  onClose,
}: {
  activityId: string | null;
  onClose: () => void;
}) {
  return (
    <SideModal
      opened={!!activityId}
      onClose={onClose}
      size="xl"
      title="Activity"
      aria-label="Activity details"
    >
      {activityId ? <DrawerBody id={activityId} /> : null}
    </SideModal>
  );
}

function DrawerBody({ id }: { id: string }) {
  const query = useActivity(id);
  return (
    <QueryState query={query}>{({ activity }) => <ActivityView activity={activity} />}</QueryState>
  );
}

function ActivityView({ activity }: { activity: ActivityDto }) {
  const user = useAuth();
  const isPm = useIsPm();
  const own = activity.assigneeId === user.id;
  return (
    <Stack gap="md">
      <div>
        <Text fw={700} fz="lg">
          {activity.title}
        </Text>
        <Group gap={6} mt={6}>
          <StatusBadge status={activity.status} />
          <PriorityBadge priority={activity.priority} />
          <WorkTypeBadge type={activity.workType} />
          {activity.isBlocked ? (
            <Text size="xs" c="coral" fw={600}>
              Blocked: {activity.blockedReason}
            </Text>
          ) : null}
          {activity.waitingOnDependency ? (
            <Text size="xs" c="sun" fw={600}>
              Waiting on dependency
            </Text>
          ) : null}
        </Group>
        <Progress
          value={activity.percentComplete}
          mt="sm"
          aria-label={`${activity.percentComplete}% complete`}
        />
      </div>
      <Tabs defaultValue="details" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="checklist">Done checklist</Tabs.Tab>
          <Tabs.Tab value="deps">Dependencies</Tabs.Tab>
          <Tabs.Tab value="comments">Comments</Tabs.Tab>
          <Tabs.Tab value="history">History</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details" pt="md">
          {isPm ? (
            <PmDetails key={activity.updatedAt} activity={activity} />
          ) : (
            <MemberDetails key={activity.updatedAt} activity={activity} editable={own} />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="checklist" pt="md">
          <ChecklistTab activity={activity} canEdit={isPm || own} />
        </Tabs.Panel>
        <Tabs.Panel value="deps" pt="md">
          <DependenciesTab activity={activity} canEdit={isPm || own} />
        </Tabs.Panel>
        <Tabs.Panel value="comments" pt="md">
          <CommentsTab id={activity.id} />
        </Tabs.Panel>
        <Tabs.Panel value="history" pt="md">
          <HistoryTab id={activity.id} projectId={activity.projectId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// ------------------------------------------------------------ details
export function GovernancePanels({
  activity,
  gov,
}: {
  activity: ActivityDto;
  gov: ReturnType<typeof useGovernedUpdate>;
}) {
  const isPm = useIsPm();
  const [reason, setReason] = useState("");
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [tradeReason, setTradeReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const sprintId = gov.pending?.sprintId ?? null;
  const sprintItems = useActivities(
    gov.needsTrade ? activity.projectId : undefined,
    sprintId ? { sprintId } : {},
  );

  return (
    <>
      {gov.dodMissing ? (
        <Alert color="sun" title="The Definition of Done is not complete" role="alert">
          <Stack gap="xs">
            <Text size="sm">Tick these on the “Done checklist” tab before marking this done:</Text>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {gov.dodMissing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {isPm ? (
              <>
                <TextInput
                  label="Override reason (recorded in the audit log)"
                  value={reason}
                  onChange={(e) => setReason(e.currentTarget.value)}
                />
                <Group>
                  <Button
                    size="xs"
                    color="sun"
                    disabled={!reason.trim()}
                    loading={gov.isPending}
                    onClick={() =>
                      gov.pending && void gov.run({ ...gov.pending, overrideReason: reason.trim() })
                    }
                  >
                    Override and mark done
                  </Button>
                  <Button size="xs" variant="default" onClick={gov.clear}>
                    Cancel
                  </Button>
                </Group>
              </>
            ) : (
              <Button size="xs" variant="default" onClick={gov.clear} w="fit-content">
                Dismiss
              </Button>
            )}
          </Stack>
        </Alert>
      ) : null}

      <SideModal
        opened={gov.needsTrade}
        onClose={gov.clear}
        title="This sprint is active: one in, one out"
        size="lg"
      >
        <Stack>
          <Text size="sm">
            Adding work to an active sprint needs a trade. Pick an unfinished activity to move back
            to the backlog
            {isPm ? ", or override with a reason." : "."}
          </Text>
          <QueryState query={sprintItems}>
            {(data) => (
              <Select
                label="Activity to remove from the sprint"
                searchable
                placeholder="Choose an activity"
                value={tradeId}
                onChange={setTradeId}
                data={data.pages
                  .flatMap((p) => p.items)
                  .filter((a) => a.id !== activity.id && a.status !== "done")
                  .map((a) => ({ value: a.id, label: a.title }))}
              />
            )}
          </QueryState>
          <TextInput
            label="Reason for the trade"
            value={tradeReason}
            onChange={(e) => setTradeReason(e.currentTarget.value)}
          />
          <Group>
            <Button
              disabled={!tradeId || !tradeReason.trim()}
              loading={gov.isPending}
              onClick={() =>
                gov.pending &&
                tradeId &&
                void gov.run({
                  ...gov.pending,
                  removeActivityId: tradeId,
                  tradeReason: tradeReason.trim(),
                })
              }
            >
              Trade
            </Button>
          </Group>
          {isPm ? (
            <Stack
              gap="xs"
              pt="sm"
              style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
            >
              <TextInput
                label="Or override (PM only, recorded in the audit log)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.currentTarget.value)}
              />
              <Button
                color="sun"
                variant="light"
                w="fit-content"
                disabled={!overrideReason.trim()}
                loading={gov.isPending}
                onClick={() =>
                  gov.pending &&
                  void gov.run({ ...gov.pending, overrideReason: overrideReason.trim() })
                }
              >
                Override without a trade
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </SideModal>
    </>
  );
}

function BlockedControl({
  activity,
  gov,
}: {
  activity: ActivityDto;
  gov: ReturnType<typeof useGovernedUpdate>;
}) {
  const [reason, setReason] = useState(activity.blockedReason ?? "");
  return (
    <Stack gap="xs">
      <Switch
        label="Blocked"
        checked={activity.isBlocked}
        disabled={gov.isPending || (!activity.isBlocked && !reason.trim())}
        description={
          !activity.isBlocked && !reason.trim()
            ? "Write the reason first, then switch on"
            : undefined
        }
        onChange={(e) =>
          void gov.run(
            e.currentTarget.checked
              ? { isBlocked: true, blockedReason: reason.trim() }
              : { isBlocked: false },
          )
        }
      />
      <TextInput
        label="Blocker reason"
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        onBlur={() => {
          if (activity.isBlocked && reason.trim() && reason.trim() !== activity.blockedReason) {
            void gov.run({ blockedReason: reason.trim() });
          }
        }}
      />
    </Stack>
  );
}

function MemberDetails({ activity, editable }: { activity: ActivityDto; editable: boolean }) {
  const gov = useGovernedUpdate(activity.id);
  const [percent, setPercent] = useState<number | string>(activity.percentComplete);
  return (
    <Stack>
      <GovernancePanels activity={activity} gov={gov} />
      {activity.description ? <Text size="sm">{activity.description}</Text> : null}
      <Text size="sm" c="dimmed">
        {activity.subprojectCode
          ? `${activity.subprojectCode} ${activity.subprojectName ?? ""} · `
          : ""}
        Assigned to {activity.assigneeName ?? "nobody"} · Due {fmtDate(activity.dueDate)}
      </Text>
      {editable ? (
        <>
          <Select
            label="Status"
            allowDeselect={false}
            value={activity.status}
            data={ACTIVITY_STATUSES.map((s) => ({ value: s, label: ENUM_LABELS.status[s] }))}
            onChange={(v) => v && void gov.run({ status: v as ActivityDto["status"] })}
          />
          <NumberInput
            label="Percent complete"
            min={0}
            max={100}
            step={5}
            value={percent}
            onChange={setPercent}
            onBlur={() => {
              const n = Number(percent);
              if (Number.isFinite(n) && n !== activity.percentComplete)
                void gov.run({ percentComplete: n });
            }}
          />
          <BlockedControl activity={activity} gov={gov} />
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Only the assignee or a PM can change this activity. You can comment on it.
        </Text>
      )}
    </Stack>
  );
}

function PmDetails({ activity }: { activity: ActivityDto }) {
  const gov = useGovernedUpdate(activity.id);
  const users = useUsers();
  const subs = useSubprojects(activity.projectId);
  const sprints = useSprints(activity.projectId);
  const releases = useReleases(activity.projectId);
  const storyMap = useStoryMap(activity.projectId);
  const [form, setForm] = useState({
    title: activity.title,
    description: activity.description ?? "",
    status: activity.status,
    priority: activity.priority,
    workType: activity.workType,
    track: activity.track,
    assigneeId: opt(activity.assigneeId),
    subprojectId: opt(activity.subprojectId),
    sprintId: opt(activity.sprintId),
    releaseId: opt(activity.releaseId),
    userStoryId: opt(activity.userStoryId),
    dueDate: activity.dueDate ?? "",
    percentComplete: activity.percentComplete as number | string,
  });
  // The parent remounts this component (key) whenever the server copy changes, so the form re-initializes then.
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const patch: UpdateActivityInput = {};
    if (form.title.trim() !== activity.title) patch.title = form.title.trim();
    if (form.description !== (activity.description ?? "")) patch.description = form.description;
    if (form.status !== activity.status) patch.status = form.status;
    if (form.priority !== activity.priority) patch.priority = form.priority;
    if (form.workType !== activity.workType) patch.workType = form.workType;
    if (form.track !== activity.track) patch.track = form.track;
    if (unopt(form.assigneeId) !== activity.assigneeId) patch.assigneeId = unopt(form.assigneeId);
    if (unopt(form.subprojectId) !== activity.subprojectId)
      patch.subprojectId = unopt(form.subprojectId);
    if (unopt(form.sprintId) !== activity.sprintId) patch.sprintId = unopt(form.sprintId);
    if (unopt(form.releaseId) !== activity.releaseId) patch.releaseId = unopt(form.releaseId);
    if (unopt(form.userStoryId) !== activity.userStoryId)
      patch.userStoryId = unopt(form.userStoryId);
    if ((form.dueDate || null) !== activity.dueDate) patch.dueDate = form.dueDate || null;
    if (Number(form.percentComplete) !== activity.percentComplete)
      patch.percentComplete = Number(form.percentComplete);
    if (Object.keys(patch).length === 0) return toast.ok("Nothing to save");
    void gov.run(patch).then((r) => r && toast.ok("Saved"));
  };

  const pick = (items: Array<{ id: string; label: string }> | undefined) => [
    { value: NONE, label: "None" },
    ...(items ?? []).map((i) => ({ value: i.id, label: i.label })),
  ];

  return (
    <Stack>
      <GovernancePanels activity={activity} gov={gov} />
      <TextInput
        label="Title"
        value={form.title}
        onChange={(e) => set("title", e.currentTarget.value)}
      />
      <Textarea
        label="Description"
        autosize
        minRows={2}
        value={form.description}
        onChange={(e) => set("description", e.currentTarget.value)}
      />
      <Group className="side-modal-pair" grow align="flex-start">
        <Select
          label="Status"
          allowDeselect={false}
          value={form.status}
          onChange={(v) => v && set("status", v as typeof form.status)}
          data={ACTIVITY_STATUSES.map((s) => ({ value: s, label: ENUM_LABELS.status[s] }))}
        />
        <Select
          label="Priority"
          allowDeselect={false}
          value={form.priority}
          onChange={(v) => v && set("priority", v as typeof form.priority)}
          data={ACTIVITY_PRIORITIES.map((s) => ({ value: s, label: ENUM_LABELS.priority[s] }))}
        />
      </Group>
      <Group className="side-modal-pair" grow align="flex-start">
        <Select
          label="Work type"
          allowDeselect={false}
          value={form.workType}
          onChange={(v) => v && set("workType", v as typeof form.workType)}
          data={WORK_TYPES.map((s) => ({ value: s, label: ENUM_LABELS.workType[s] }))}
        />
        <Select
          label="Track"
          allowDeselect={false}
          value={form.track}
          onChange={(v) => v && set("track", v as typeof form.track)}
          data={TRACKS.map((s) => ({ value: s, label: ENUM_LABELS.track[s] }))}
        />
      </Group>
      <Select
        label="Assignee"
        searchable
        value={form.assigneeId}
        onChange={(v) => set("assigneeId", v ?? NONE)}
        data={pick(
          users.data?.filter((u) => u.isActive).map((u) => ({ id: u.id, label: u.fullName })),
        )}
      />
      <Select
        label="Subproject"
        searchable
        value={form.subprojectId}
        onChange={(v) => set("subprojectId", v ?? NONE)}
        data={pick(subs.data?.map((s) => ({ id: s.id, label: s.name })))}
      />
      <Group className="side-modal-pair" grow align="flex-start">
        <Select
          label="Sprint"
          value={form.sprintId}
          onChange={(v) => set("sprintId", v ?? NONE)}
          data={pick(
            sprints.data?.map((s) => ({
              id: s.id,
              label: `${s.name} (${ENUM_LABELS.sprintStatus[s.status]})`,
            })),
          )}
        />
        <Select
          label="Release"
          value={form.releaseId}
          onChange={(v) => set("releaseId", v ?? NONE)}
          data={pick(releases.data?.map((r) => ({ id: r.id, label: r.name })))}
        />
      </Group>
      <Group className="side-modal-pair" grow align="flex-start">
        <Select
          label="User story"
          description={
            activity.subprojectId ? undefined : "Set a subproject to pick from its stories"
          }
          searchable
          value={form.userStoryId}
          onChange={(v) => set("userStoryId", v ?? NONE)}
          data={pick(
            storyMap.data?.stories.map((st) => ({
              id: st.id,
              label: `${st.code} ${st.story.slice(0, 60)}`,
            })),
          )}
        />
      </Group>
      <Group className="side-modal-pair" grow align="flex-start">
        <TextInput
          label="Due date"
          type="date"
          value={form.dueDate}
          onChange={(e) => set("dueDate", e.currentTarget.value)}
        />
        <NumberInput
          label="Percent complete"
          min={0}
          max={100}
          step={5}
          value={form.percentComplete}
          onChange={(v) => set("percentComplete", v)}
        />
      </Group>
      <Button onClick={save} loading={gov.isPending} w="fit-content">
        Save changes
      </Button>
      <BlockedControl activity={activity} gov={gov} />
    </Stack>
  );
}

// ------------------------------------------------------------ checklist
function ChecklistTab({ activity, canEdit }: { activity: ActivityDto; canEdit: boolean }) {
  const q = useChecklist(activity.id);
  const setCheck = useSetCheck(activity.id);
  return (
    <QueryState
      query={q}
      isEmpty={(d) => d.length === 0}
      empty="No Definition of Done items are active for this project."
    >
      {(items) => (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {items.filter((i) => i.checked).length} of {items.length} done. Every item must be
            ticked before this can be marked done.
          </Text>
          {items.map((i) => (
            <Checkbox
              key={i.templateId}
              label={i.label}
              checked={i.checked}
              disabled={!canEdit || setCheck.isPending}
              onChange={(e) =>
                setCheck.mutate(
                  { templateId: i.templateId, checked: e.currentTarget.checked },
                  { onError: (err) => toast.error(err.message) },
                )
              }
            />
          ))}
        </Stack>
      )}
    </QueryState>
  );
}

// ------------------------------------------------------------ dependencies
function DependenciesTab({ activity, canEdit }: { activity: ActivityDto; canEdit: boolean }) {
  const q = useDependencies(activity.id);
  const add = useAddDependency(activity.id);
  const remove = useRemoveDependency(activity.id);
  const [text, setText] = useState("");
  const [debounced] = useDebouncedValue(text, 250);
  const search = useSearch(debounced);
  const options = (search.data?.activities ?? [])
    .filter((a) => a.id !== activity.id)
    .map((a) => ({
      value: a.id,
      label: `${a.subprojectCode ? `${a.subprojectCode} · ` : ""}${a.title}`,
    }));

  return (
    <QueryState query={q}>
      {(deps) => (
        <Stack>
          <Text fw={600} size="sm">
            Waiting on
          </Text>
          {deps.waitingOn.length === 0 ? (
            <Text size="sm" c="dimmed">
              Nothing.
            </Text>
          ) : null}
          {deps.waitingOn.map((d) => (
            <Group key={d.activityId} justify="space-between" wrap="nowrap">
              <Text size="sm" lineClamp={2}>
                {d.subprojectCode ? `${d.subprojectCode} · ` : ""}
                {d.title}
              </Text>
              <Group gap={6} wrap="nowrap">
                <StatusBadge status={d.status} />
                {canEdit ? (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="coral"
                    loading={remove.isPending}
                    onClick={() =>
                      remove.mutate(d.activityId, { onError: (e) => toast.error(e.message) })
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </Group>
            </Group>
          ))}
          {canEdit ? (
            <Select
              label="Add a dependency (this activity waits on…)"
              placeholder="Search by title, any subproject"
              searchable
              data={options}
              searchValue={text}
              onSearchChange={setText}
              value={null}
              nothingFoundMessage={
                debounced.length < 3 ? "Type at least 3 characters" : "No matches"
              }
              filter={({ options: o }) => o}
              onChange={(v) =>
                v &&
                add.mutate(v, {
                  onSuccess: () => setText(""),
                  onError: (e) => toast.error(e.message),
                })
              }
            />
          ) : null}
          <Text fw={600} size="sm" mt="sm">
            Blocks
          </Text>
          {deps.blocks.length === 0 ? (
            <Text size="sm" c="dimmed">
              Nothing.
            </Text>
          ) : null}
          {deps.blocks.map((d) => (
            <Group key={d.activityId} justify="space-between" wrap="nowrap">
              <Text size="sm" lineClamp={2}>
                {d.subprojectCode ? `${d.subprojectCode} · ` : ""}
                {d.title}
              </Text>
              <StatusBadge status={d.status} />
            </Group>
          ))}
        </Stack>
      )}
    </QueryState>
  );
}

// ------------------------------------------------------------ comments and history
function CommentsTab({ id }: { id: string }) {
  const q = useComments(id);
  const add = useAddComment(id);
  const [body, setBody] = useState("");
  return (
    <Stack>
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty="No comments yet.">
        {(items) => (
          <Stack gap="sm">
            {items.map((c) => (
              <div key={c.id}>
                <Text size="xs" c="dimmed">
                  {c.authorName} · {fmtDateTime(c.createdAt)}
                </Text>
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {c.body}
                </Text>
              </div>
            ))}
          </Stack>
        )}
      </QueryState>
      <Textarea
        label="Add a comment"
        autosize
        minRows={2}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
      />
      <Button
        w="fit-content"
        disabled={!body.trim()}
        loading={add.isPending}
        onClick={() =>
          add.mutate(body.trim(), {
            onSuccess: () => setBody(""),
            onError: (e) => toast.error(e.message),
          })
        }
      >
        Comment
      </Button>
    </Stack>
  );
}

function HistoryTab({ id, projectId }: { id: string; projectId: string }) {
  const q = useEvents(id);
  const users = useUsers();
  const sprints = useSprints(projectId);
  const name = (uid: string | null) =>
    users.data?.find((u) => u.id === uid)?.fullName ?? (uid ? "someone" : "nobody");
  const sprintName = (sid: string | null) =>
    sprints.data?.find((s) => s.id === sid)?.name ?? (sid ? "a sprint" : "the backlog");
  const describe = (e: ActivityEventDto): string => {
    switch (e.eventType) {
      case "status_changed":
        return `Status: ${e.fromValue ? ENUM_LABELS.status[e.fromValue as keyof typeof ENUM_LABELS.status] : "new"} → ${ENUM_LABELS.status[e.toValue as keyof typeof ENUM_LABELS.status] ?? e.toValue}`;
      case "blocked":
        return "Marked blocked";
      case "unblocked":
        return "Unblocked";
      case "sprint_changed":
        return `Sprint: ${sprintName(e.fromValue)} → ${sprintName(e.toValue)}`;
      case "assigned":
        return `Assigned: ${name(e.fromValue)} → ${name(e.toValue)}`;
    }
  };
  return (
    <QueryState query={q} isEmpty={(d) => d.length === 0} empty="No changes recorded yet.">
      {(events) => (
        <Timeline bulletSize={14} lineWidth={2} active={events.length}>
          {events.map((e) => (
            <Timeline.Item key={e.id} title={describe(e)}>
              <Text size="xs" c="dimmed">
                {e.actorName ?? "System"} · {fmtDateTime(e.occurredAt)}
              </Text>
              {e.note ? <Text size="xs">{e.note}</Text> : null}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </QueryState>
  );
}
