import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import TimelineVis from "../TimelineVis.vue";
import type { TimelineEvent } from "../TimelineVis.vue";

const events: TimelineEvent[] = [
  { id: "e1", time: "2024-01", description: "Event A", characters: ["Alice", "Bob"] },
  { id: "e2", time: "2024-03", description: "Event B", characters: ["Carol"] },
  { id: "e3", time: "2024-06", description: "Event C", characters: ["Alice", "Dave", "Eve"] },
];

describe("TimelineVis", () => {
  it("renders SVG element", () => {
    const wrapper = mount(TimelineVis, { props: { events } });
    expect(wrapper.find("svg").exists()).toBe(true);
  });

  it("renders correct number of event circles", () => {
    const wrapper = mount(TimelineVis, { props: { events } });
    const circles = wrapper.findAll("circle");
    expect(circles).toHaveLength(3);
  });

  it("event descriptions are displayed", () => {
    const wrapper = mount(TimelineVis, { props: { events } });
    const svg = wrapper.find("svg");
    expect(svg.text()).toContain("Event A");
    expect(svg.text()).toContain("Event B");
    expect(svg.text()).toContain("Event C");
  });

  it("click on event circle emits select with correct id", async () => {
    const wrapper = mount(TimelineVis, { props: { events } });
    const circles = wrapper.findAll("circle");
    await circles[1]!.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
    expect(wrapper.emitted("select")![0]).toEqual(["e2"]);
  });

  it("character names are displayed for each event", () => {
    const wrapper = mount(TimelineVis, { props: { events } });
    const svg = wrapper.find("svg");
    expect(svg.text()).toContain("Alice, Bob");
    expect(svg.text()).toContain("Carol");
    expect(svg.text()).toContain("Alice, Dave, Eve");
  });
});
