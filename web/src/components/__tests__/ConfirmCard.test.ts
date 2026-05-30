import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import ConfirmCard from "../ConfirmCard.vue";

describe("ConfirmCard", () => {
  it("renders summary text", () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "B", summary: "Ready to proceed?" },
    });
    expect(wrapper.find(".confirm-card__summary").text()).toBe(
      "Ready to proceed?",
    );
  });

  it("shows correct level badge for B", () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "B", summary: "test" },
    });
    expect(wrapper.find(".confirm-card__badge").text()).toBe("通知");
    expect(wrapper.find(".confirm-card__badge").classes()).toContain(
      "confirm-card__badge--B",
    );
  });

  it("shows correct level badge for C", () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "C", summary: "test" },
    });
    expect(wrapper.find(".confirm-card__badge").text()).toBe("阻断");
    expect(wrapper.find(".confirm-card__badge").classes()).toContain(
      "confirm-card__badge--C",
    );
  });

  it("B-level shows approve and cancel buttons", () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "B", summary: "test" },
    });
    const buttons = wrapper.findAll(".btn");
    const texts = buttons.map((b) => b.text());
    expect(texts).toContain("批准");
    expect(texts).toContain("取消");
    expect(texts).not.toContain("继续");
    expect(texts).not.toContain("修改");
    expect(texts).not.toContain("停止");
  });

  it("C-level shows continue, revise, and stop buttons", () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "C", summary: "test" },
    });
    const buttons = wrapper.findAll(".btn");
    const texts = buttons.map((b) => b.text());
    expect(texts).toContain("继续");
    expect(texts).toContain("修改");
    expect(texts).toContain("停止");
    expect(texts).not.toContain("批准");
    expect(texts).not.toContain("取消");
  });

  it("clicking approve emits approve", async () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "B", summary: "test" },
    });
    await wrapper.findAll(".btn")[0]!.trigger("click");
    expect(wrapper.emitted("approve")).toHaveLength(1);
  });

  it("clicking cancel (B-level) emits cancel", async () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "B", summary: "test" },
    });
    const cancelBtn = wrapper.findAll(".btn").find((b) => b.text() === "取消");
    await cancelBtn!.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("clicking revise (C-level) emits revise", async () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "C", summary: "test" },
    });
    const reviseBtn = wrapper.findAll(".btn").find((b) => b.text() === "修改");
    await reviseBtn!.trigger("click");
    expect(wrapper.emitted("revise")).toHaveLength(1);
  });

  it("clicking stop (C-level) emits reject", async () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "C", summary: "test" },
    });
    const stopBtn = wrapper.findAll(".btn").find((b) => b.text() === "停止");
    await stopBtn!.trigger("click");
    expect(wrapper.emitted("reject")).toHaveLength(1);
  });

  it("details section hidden by default, toggle shows it", async () => {
    const wrapper = mount(ConfirmCard, {
      props: { level: "B", summary: "test", details: "extra info" },
    });
    expect(wrapper.find(".confirm-card__details").exists()).toBe(false);
    await wrapper.find(".confirm-card__details-toggle").trigger("click");
    expect(wrapper.find(".confirm-card__details").exists()).toBe(true);
    expect(wrapper.find(".confirm-card__details").text()).toBe("extra info");
  });
});
