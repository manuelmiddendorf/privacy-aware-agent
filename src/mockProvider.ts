import type { ModelProvider, ProviderInput, ProviderOutput } from "./types.js";

export class MockProvider implements ModelProvider {
  readonly name = "MOCK_OFFLINE";
  callCount = 0;

  async generate(input: ProviderInput): Promise<ProviderOutput> {
    if (input.task === "ask" && input.documents.length === 0) {
      throw new Error(`MOCK_OFFLINE requires approved evidence for ${input.task}`);
    }
    this.callCount += 1;
    const citations = input.documents.map((document) => document.id);
    if (input.task === "summarize") {
      const material = input.documents.length > 0
        ? input.documents.map((document) => document.body).join(" ")
        : input.text;
      return { text: `MOCK summary: ${material}`.slice(0, 500), citations };
    }
    if (input.task === "draft") {
      if (/gardening-day invitation[\s\S]*\[Date\][\s\S]*\[Time\][\s\S]*\[Location\]/.test(input.text)) {
        return {
          text: "MOCK_OFFLINE example letter:\nDear families,\n\nYou are warmly invited to our gardening day on [Date] at [Time]. We will meet at [Location]. We look forward to your support!",
          citations,
        };
      }
      return { text: `MOCK draft based on approved context: ${input.text}`, citations };
    }
    const context = input.documents.map((document) => document.body).join(" ");
    return { text: context ? `MOCK answer: ${context}` : `MOCK answer to: ${input.text}`, citations };
  }
}
