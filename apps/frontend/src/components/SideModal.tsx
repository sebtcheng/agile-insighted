import { Drawer, type DrawerProps } from "@mantine/core";

/** Right-aligned, full-height slide-over used in place of centered modals. Styled in styles/side-modal.css. */
export type SideModalProps = Omit<DrawerProps, "position" | "offset" | "radius">;

const BASE = {
  content: "side-modal",
  header: "side-modal-header",
  title: "side-modal-title",
  body: "side-modal-body",
  close: "side-modal-close",
};

export function SideModal({ classNames, transitionProps, ...props }: SideModalProps) {
  const merged = Object.fromEntries(
    Object.entries(BASE).map(([k, v]) => [
      k,
      [v, (classNames as Record<string, string> | undefined)?.[k]].filter(Boolean).join(" "),
    ]),
  );
  return (
    <Drawer
      position="right"
      classNames={{ ...(classNames as object), ...merged }}
      transitionProps={{
        transition: "slide-left",
        duration: 160,
        timingFunction: "cubic-bezier(0.2, 0, 0, 1)",
        ...transitionProps,
      }}
      {...props}
    />
  );
}
