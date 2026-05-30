import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import RelationGraph from "../RelationGraph.vue";
import type { GraphNode, GraphEdge } from "../RelationGraph.vue";

const nodes: GraphNode[] = [
  { id: "n1", label: "Alice" },
  { id: "n2", label: "Bob" },
  { id: "n3", label: "Carol" },
];

const edges: GraphEdge[] = [
  { source: "n1", target: "n2", type: "friend" },
  { source: "n2", target: "n3", type: "rival" },
];

describe("RelationGraph", () => {
  it("renders SVG element with correct dimensions", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
    });
    const svg = wrapper.find("svg");
    expect(svg.exists()).toBe(true);
    expect(svg.attributes("width")).toBe("600");
    expect(svg.attributes("height")).toBe("400");
  });

  it("renders correct number of node circles", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
    });
    const circles = wrapper.findAll("circle");
    expect(circles).toHaveLength(3);
  });

  it("renders correct number of edge lines", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
    });
    const lines = wrapper.findAll("line");
    expect(lines).toHaveLength(2);
  });

  it("node labels are displayed", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
    });
    const svg = wrapper.find("svg");
    expect(svg.text()).toContain("Alice");
    expect(svg.text()).toContain("Bob");
    expect(svg.text()).toContain("Carol");
  });

  it("edge type labels are displayed", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
    });
    const svg = wrapper.find("svg");
    expect(svg.text()).toContain("friend");
    expect(svg.text()).toContain("rival");
  });

  it("click on node circle emits select with correct id", async () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
    });
    const circles = wrapper.findAll("circle");
    await circles[0]!.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
    expect(wrapper.emitted("select")![0]).toEqual(["n1"]);
  });
});
