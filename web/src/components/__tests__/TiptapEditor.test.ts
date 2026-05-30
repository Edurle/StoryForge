import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import TiptapEditor from "../TiptapEditor.vue";
import type { EditorSegment } from "../TiptapEditor.vue";

const segments: EditorSegment[] = [
  { id: "s1", content: "First segment", order: 1 },
  { id: "s2", content: "Second segment", order: 2 },
  { id: "s3", content: "Third segment", order: 3 },
];

describe("TiptapEditor", () => {
  it("renders all segments with their content", () => {
    const wrapper = mount(TiptapEditor, { props: { segments } });
    const textareas = wrapper.findAll("textarea");
    expect(textareas).toHaveLength(3);
    expect(textareas[0]!.element.value).toBe("First segment");
    expect(textareas[1]!.element.value).toBe("Second segment");
    expect(textareas[2]!.element.value).toBe("Third segment");
  });

  it("segments are editable when not readonly", () => {
    const wrapper = mount(TiptapEditor, { props: { segments } });
    const textareas = wrapper.findAll("textarea");
    expect(textareas).toHaveLength(3);
    for (const ta of textareas) {
      expect(ta.element.disabled).toBe(false);
    }
  });

  it("segments are not editable when readonly", () => {
    const wrapper = mount(TiptapEditor, {
      props: { segments, readonly: true },
    });
    expect(wrapper.findAll("textarea")).toHaveLength(0);
    const divs = wrapper.findAll(".segment-readonly");
    expect(divs).toHaveLength(3);
    expect(divs[0]!.text()).toBe("First segment");
  });

  it("segment order numbers are displayed", () => {
    const wrapper = mount(TiptapEditor, { props: { segments } });
    const labels = wrapper.findAll(".segment-order");
    expect(labels).toHaveLength(3);
    expect(labels[0]!.text()).toBe("1");
    expect(labels[1]!.text()).toBe("2");
    expect(labels[2]!.text()).toBe("3");
  });

  it("Ctrl+S emits save event", () => {
    const wrapper = mount(TiptapEditor, { props: { segments } });
    wrapper.find(".tiptap-editor").trigger("keydown", {
      key: "s",
      ctrlKey: true,
    });
    expect(wrapper.emitted("save")).toHaveLength(1);
  });

  it("editing segment emits update with correct id and content", async () => {
    const wrapper = mount(TiptapEditor, { props: { segments } });
    const textarea = wrapper.findAll("textarea")[1]!;
    await textarea.setValue("Updated content");
    expect(wrapper.emitted("update")).toHaveLength(1);
    expect(wrapper.emitted("update")![0]).toEqual(["s2", "Updated content"]);
  });
});
