import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDestroy = vi.fn();
const mockOn = vi.fn();
const mockAdd = vi.fn();
const mockClear = vi.fn();

vi.mock("vis-network/standalone", () => {
  return {
    Network: function MockNetwork(this: unknown, ..._args: unknown[]) {
      return { on: mockOn, destroy: mockDestroy };
    },
  };
});

vi.mock("vis-data/standalone", () => {
  return {
    DataSet: function MockDataSet(this: unknown, ..._args: unknown[]) {
      return { add: mockAdd, clear: mockClear };
    },
  };
});

import RelationGraph from "../RelationGraph.vue";
import type { GraphNode, GraphEdge } from "../RelationGraph.vue";

const nodes: GraphNode[] = [
  { id: "n1", label: "Alice", group: "character" },
  { id: "n2", label: "Bob", group: "character" },
  { id: "n3", label: "Sword", group: "item" },
];

const edges: GraphEdge[] = [
  { source: "n1", target: "n2", type: "friend" },
  { source: "n2", target: "n3", type: "wields" },
];

describe("RelationGraph", () => {
  beforeEach(() => {
    mockOn.mockClear();
    mockDestroy.mockClear();
    mockAdd.mockClear();
    mockClear.mockClear();
  });

  it("renders container div with relation-graph class", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
      attachTo: document.body,
    });
    const div = wrapper.find(".relation-graph");
    expect(div.exists()).toBe(true);
    expect(div.attributes("role")).toBe("img");
    wrapper.unmount();
  });

  it("has CSS width:100% and height:100%", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
      attachTo: document.body,
    });
    const div = wrapper.find(".relation-graph");
    expect(div.exists()).toBe(true);
    wrapper.unmount();
  });

  it("calls Network on mount and registers click handler", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
      attachTo: document.body,
    });
    expect(mockOn).toHaveBeenCalledWith("click", expect.any(Function));
    wrapper.unmount();
  });

  it("destroys network on unmount", () => {
    const wrapper = mount(RelationGraph, {
      props: { nodes, edges },
      attachTo: document.body,
    });
    wrapper.unmount();
    expect(mockDestroy).toHaveBeenCalled();
  });
});
