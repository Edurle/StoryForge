import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import DiffViewer from "../DiffViewer.vue";
import type { DiffLine } from "../DiffViewer.vue";

const sampleDiffs: DiffLine[] = [
  { left: "line 1", right: "line 1", type: "equal" },
  { left: "old line", right: "new line", type: "changed" },
  { left: "", right: "added line", type: "added" },
  { left: "removed line", right: "", type: "removed" },
];

describe("DiffViewer", () => {
  it("renders title in header", () => {
    const wrapper = mount(DiffViewer, {
      props: { title: "Chapter Diff", diffs: [] },
    });
    expect(wrapper.find(".header").text()).toBe("Chapter Diff");
  });

  it("shows two columns with headers", () => {
    const wrapper = mount(DiffViewer, {
      props: { title: "Diff", diffs: [] },
    });
    const headers = wrapper.findAll(".column-header");
    expect(headers).toHaveLength(2);
    expect(headers[0]!.text()).toBe("修改前");
    expect(headers[1]!.text()).toBe("修改后");
  });

  it("renders diff lines with correct content in each column", () => {
    const wrapper = mount(DiffViewer, {
      props: { title: "Diff", diffs: sampleDiffs },
    });
    const columns = wrapper.findAll(".column");
    const leftLines = columns[0]!.findAll(".diff-line");
    const rightLines = columns[1]!.findAll(".diff-line");
    expect(leftLines).toHaveLength(4);
    expect(rightLines).toHaveLength(4);
    expect(leftLines[0]!.text()).toBe("line 1");
    expect(rightLines[0]!.text()).toBe("line 1");
  });

  it("equal lines show in both columns", () => {
    const diffs: DiffLine[] = [
      { left: "same", right: "same", type: "equal" },
    ];
    const wrapper = mount(DiffViewer, {
      props: { title: "Diff", diffs },
    });
    const columns = wrapper.findAll(".column");
    expect(columns[0]!.find(".diff-line").text()).toBe("same");
    expect(columns[1]!.find(".diff-line").text()).toBe("same");
    expect(columns[0]!.find(".diff-line").classes()).toContain("equal");
  });

  it("clicking confirm button emits confirm", async () => {
    const wrapper = mount(DiffViewer, {
      props: { title: "Diff", diffs: [] },
    });
    await wrapper.find(".confirm-btn").trigger("click");
    expect(wrapper.emitted("confirm")).toBeTruthy();
  });

  it("clicking reject button emits reject", async () => {
    const wrapper = mount(DiffViewer, {
      props: { title: "Diff", diffs: [] },
    });
    await wrapper.find(".reject-btn").trigger("click");
    expect(wrapper.emitted("reject")).toBeTruthy();
  });
});
