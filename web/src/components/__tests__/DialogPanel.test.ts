import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import DialogPanel from "../DialogPanel.vue";

const messages = [
  { role: "user" as const, content: "Hello" },
  { role: "assistant" as const, content: "Hi there" },
  { role: "tool" as const, content: "Tool output" },
  { role: "error" as const, content: "Something failed" },
];

describe("DialogPanel", () => {
  it("renders all messages with correct content", () => {
    const wrapper = mount(DialogPanel, { props: { messages } });
    const els = wrapper.findAll(".message__content");
    expect(els).toHaveLength(4);
    expect(els[0]!.text()).toBe("Hello");
    expect(els[1]!.text()).toBe("Hi there");
    expect(els[2]!.text()).toBe("Tool output");
    expect(els[3]!.text()).toBe("Something failed");
  });

  it("shows correct role label for each message", () => {
    const wrapper = mount(DialogPanel, { props: { messages } });
    const labels = wrapper.findAll(".message__role");
    expect(labels[0]!.text()).toBe("用户");
    expect(labels[1]!.text()).toBe("助手");
    expect(labels[2]!.text()).toBe("工具");
    expect(labels[3]!.text()).toBe("错误");
  });

  it("emits send with input text when send button is clicked", async () => {
    const wrapper = mount(DialogPanel, { props: { messages: [] } });
    const input = wrapper.find(".input-bar__field");
    await input.setValue("test message");
    await wrapper.find(".input-bar__btn").trigger("click");
    expect(wrapper.emitted("send")).toEqual([["test message"]]);
  });

  it("emits send when Enter key is pressed in input", async () => {
    const wrapper = mount(DialogPanel, { props: { messages: [] } });
    const input = wrapper.find(".input-bar__field");
    await input.setValue("hello");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("send")).toEqual([["hello"]]);
  });

  it("clears input after send", async () => {
    const wrapper = mount(DialogPanel, { props: { messages: [] } });
    const input = wrapper.find(".input-bar__field");
    await input.setValue("abc");
    await wrapper.find(".input-bar__btn").trigger("click");
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("disables input and button when disabled prop is true", () => {
    const wrapper = mount(DialogPanel, {
      props: { messages: [], disabled: true },
    });
    expect(
      (wrapper.find(".input-bar__field").element as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (wrapper.find(".input-bar__btn").element as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
