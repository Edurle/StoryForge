import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import ContentViewer from "../ContentViewer.vue";

describe("ContentViewer", () => {
  it("null content shows placeholder text", () => {
    const wrapper = mount(ContentViewer, { props: { content: null } });
    expect(wrapper.text()).toContain("暂无内容");
  });

  it("text type renders the text", () => {
    const wrapper = mount(ContentViewer, {
      props: { content: { type: "text", data: "Hello World" } },
    });
    expect(wrapper.text()).toContain("Hello World");
  });

  it("timeline type renders list of events with time and description", () => {
    const data = [
      { time: "2024-01-01", description: "Event A" },
      { time: "2024-01-02", description: "Event B" },
    ];
    const wrapper = mount(ContentViewer, {
      props: { content: { type: "timeline", data } },
    });
    const items = wrapper.findAll(".timeline-content li");
    expect(items).toHaveLength(2);
    expect(items[0]!.text()).toContain("2024-01-01");
    expect(items[0]!.text()).toContain("Event A");
  });

  it("relations type renders list with source and target", () => {
    const data = [
      { source: "Alice", target: "Bob", type: "friend" },
    ];
    const wrapper = mount(ContentViewer, {
      props: { content: { type: "relations", data } },
    });
    const items = wrapper.findAll(".relations-content li");
    expect(items).toHaveLength(1);
    expect(items[0]!.text()).toContain("Alice → Bob");
    expect(items[0]!.text()).toContain("friend");
  });

  it("form type renders key-value pairs", () => {
    const data = { name: "Test Project", author: "Writer" };
    const wrapper = mount(ContentViewer, {
      props: { content: { type: "form", data } },
    });
    const dts = wrapper.findAll("dt");
    const dds = wrapper.findAll("dd");
    expect(dts).toHaveLength(2);
    expect(dds).toHaveLength(2);
    expect(wrapper.text()).toContain("name");
    expect(wrapper.text()).toContain("Test Project");
    expect(wrapper.text()).toContain("author");
    expect(wrapper.text()).toContain("Writer");
  });
});
