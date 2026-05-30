import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import FileTree from "../FileTree.vue";
import type { TreeNode } from "../FileTree.vue";

const simpleNodes: TreeNode[] = [
  { id: "1", label: "Chapter 1" },
  { id: "2", label: "Chapter 2", status: "modified" },
  { id: "3", label: "Chapter 3", status: "new" },
  { id: "4", label: "Chapter 4", status: "conflict" },
];

const nestedNodes: TreeNode[] = [
  {
    id: "1",
    label: "Volume 1",
    children: [
      { id: "1-1", label: "Chapter 1" },
      { id: "1-2", label: "Chapter 2" },
    ],
  },
  { id: "2", label: "Volume 2" },
];

describe("FileTree", () => {
  it("renders top-level nodes as list items", () => {
    const wrapper = mount(FileTree, { props: { nodes: simpleNodes } });
    const items = wrapper.findAll("li");
    expect(items).toHaveLength(4);
    expect(items[0]!.text()).toContain("Chapter 1");
  });

  it("clicking a node emits select with correct id", async () => {
    const wrapper = mount(FileTree, { props: { nodes: simpleNodes } });
    await wrapper.findAll(".node-label")[0]!.trigger("click");
    expect(wrapper.emitted("select")).toBeTruthy();
    expect(wrapper.emitted("select")![0]).toEqual(["1"]);
  });

  it("nodes with status show indicator", () => {
    const wrapper = mount(FileTree, { props: { nodes: simpleNodes } });
    const labels = wrapper.findAll(".node-label");
    expect(labels[1]!.text()).toContain("*");
    expect(labels[2]!.text()).toContain("+");
    expect(labels[3]!.text()).toContain("!");
  });

  it("nodes with children show expand arrow, clicking toggles children visibility", async () => {
    const wrapper = mount(FileTree, { props: { nodes: nestedNodes } });
    const toggle = wrapper.find(".toggle");
    expect(toggle.text()).toBe("▶");

    await toggle.trigger("click");

    const childTree = wrapper.findComponent(FileTree);
    expect(childTree.exists()).toBe(true);
    expect(childTree.props("nodes")).toHaveLength(2);

    const toggleAfter = wrapper.find(".toggle");
    expect(toggleAfter.text()).toBe("▼");
  });

  it("initially children are hidden", () => {
    const wrapper = mount(FileTree, { props: { nodes: nestedNodes } });
    expect(wrapper.findAll(".file-tree .file-tree")).toHaveLength(0);
  });
});
