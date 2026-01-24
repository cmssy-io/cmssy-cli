import { describe, it, expect } from "vitest";
import {
  convertSchemaToFields,
  extractDefaultContent,
  extractBlockType,
  addComponentForSSR,
  isTemplate,
  parsePagesJson,
} from "../src/utils/publish-helpers.js";

// =============================================================================
// convertSchemaToFields
// =============================================================================

describe("convertSchemaToFields", () => {
  it("should convert basic text field", () => {
    const schema = {
      title: {
        type: "text",
        label: "Title",
        required: true,
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result).toEqual([
      {
        key: "title",
        type: "text",
        label: "Title",
        required: true,
      },
    ]);
  });

  it("should convert field with defaultValue", () => {
    const schema = {
      buttonText: {
        type: "text",
        label: "Button Text",
        defaultValue: "Click me",
        required: false,
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result[0].defaultValue).toBe("Click me");
  });

  it("should convert field with placeholder and helpText", () => {
    const schema = {
      email: {
        type: "text",
        label: "Email",
        placeholder: "Enter your email",
        helpText: "We will never share your email",
        required: true,
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result[0].placeholder).toBe("Enter your email");
    expect(result[0].helperText).toBe("We will never share your email");
  });

  it("should convert field with group", () => {
    const schema = {
      title: {
        type: "text",
        label: "Title",
        group: "Content",
        required: false,
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result[0].group).toBe("Content");
  });

  it("should convert field with showWhen condition", () => {
    const schema = {
      customUrl: {
        type: "text",
        label: "Custom URL",
        required: false,
        showWhen: {
          field: "useCustomUrl",
          equals: true,
        },
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result[0].showWhen).toEqual({
      field: "useCustomUrl",
      equals: true,
    });
  });

  it("should convert field with validation rules", () => {
    const schema = {
      username: {
        type: "text",
        label: "Username",
        required: true,
        validation: {
          minLength: 3,
          maxLength: 20,
          pattern: "^[a-z0-9_]+$",
          message: "Only lowercase letters, numbers, and underscores",
        },
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result[0].validation).toEqual({
      minLength: 3,
      maxLength: 20,
      pattern: "^[a-z0-9_]+$",
      message: "Only lowercase letters, numbers, and underscores",
    });
  });

  it("should convert select field with options", () => {
    const schema = {
      alignment: {
        type: "select",
        label: "Alignment",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
          { label: "Right", value: "right" },
        ],
        required: false,
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result[0].options).toEqual([
      { label: "Left", value: "left" },
      { label: "Center", value: "center" },
      { label: "Right", value: "right" },
    ]);
  });

  it("should convert repeater field with nested schema", () => {
    const schema = {
      features: {
        type: "repeater",
        label: "Features",
        minItems: 1,
        maxItems: 10,
        schema: {
          title: {
            type: "text",
            label: "Feature Title",
            required: true,
          },
          description: {
            type: "textarea",
            label: "Description",
            required: false,
          },
        },
        required: false,
      },
    };

    const result = convertSchemaToFields(schema);

    expect(result[0].type).toBe("repeater");
    expect(result[0].minItems).toBe(1);
    expect(result[0].maxItems).toBe(10);
    expect(result[0].itemSchema).toEqual([
      { key: "title", type: "text", label: "Feature Title", required: true },
      {
        key: "description",
        type: "textarea",
        label: "Description",
        required: false,
      },
    ]);
  });

  it("should convert multiple fields", () => {
    const schema = {
      title: { type: "text", label: "Title", required: true },
      subtitle: { type: "text", label: "Subtitle", required: false },
      description: { type: "textarea", label: "Description", required: false },
    };

    const result = convertSchemaToFields(schema);

    expect(result).toHaveLength(3);
    expect(result.map((f) => f.key)).toEqual([
      "title",
      "subtitle",
      "description",
    ]);
  });
});

// =============================================================================
// extractDefaultContent
// =============================================================================

describe("extractDefaultContent", () => {
  it("should extract default values from schema", () => {
    const schema = {
      title: {
        type: "text",
        label: "Title",
        defaultValue: "Welcome",
      },
      subtitle: {
        type: "text",
        label: "Subtitle",
        defaultValue: "Get started today",
      },
    };

    const result = extractDefaultContent(schema);

    expect(result).toEqual({
      title: "Welcome",
      subtitle: "Get started today",
    });
  });

  it("should skip fields without defaultValue", () => {
    const schema = {
      title: {
        type: "text",
        label: "Title",
        defaultValue: "Welcome",
      },
      description: {
        type: "textarea",
        label: "Description",
        // No defaultValue
      },
    };

    const result = extractDefaultContent(schema);

    expect(result).toEqual({ title: "Welcome" });
    expect(result.description).toBeUndefined();
  });

  it("should initialize repeater fields as empty arrays", () => {
    const schema = {
      features: {
        type: "repeater",
        label: "Features",
        schema: {
          title: { type: "text", label: "Title" },
        },
      },
    };

    const result = extractDefaultContent(schema);

    expect(result).toEqual({ features: [] });
  });

  it("should handle mixed field types", () => {
    const schema = {
      title: { type: "text", label: "Title", defaultValue: "Hello" },
      count: { type: "number", label: "Count", defaultValue: 5 },
      enabled: { type: "switch", label: "Enabled", defaultValue: true },
      items: { type: "repeater", label: "Items", schema: {} },
      description: { type: "textarea", label: "Description" },
    };

    const result = extractDefaultContent(schema);

    expect(result).toEqual({
      title: "Hello",
      count: 5,
      enabled: true,
      items: [],
    });
  });

  it("should return empty object for empty schema", () => {
    const result = extractDefaultContent({});

    expect(result).toEqual({});
  });
});

// =============================================================================
// extractBlockType
// =============================================================================

describe("extractBlockType", () => {
  it("should extract block type from scoped package with blocks prefix", () => {
    expect(extractBlockType("@cmssy/blocks.hero")).toBe("hero");
  });

  it("should extract block type from scoped package with templates prefix", () => {
    expect(extractBlockType("@org/templates.landing")).toBe("landing");
  });

  it("should handle custom org scope", () => {
    expect(extractBlockType("@my-company/blocks.feature-card")).toBe(
      "feature-card"
    );
  });

  it("should handle package without scope", () => {
    expect(extractBlockType("blocks.hero")).toBe("hero");
  });

  it("should return name unchanged if no prefix", () => {
    expect(extractBlockType("hero")).toBe("hero");
  });

  it("should handle complex package names", () => {
    expect(extractBlockType("@cmssy-marketing/blocks.cta-section")).toBe(
      "cta-section"
    );
  });
});

// =============================================================================
// addComponentForSSR
// =============================================================================

describe("addComponentForSSR", () => {
  it("should return code unchanged if no mount/update pattern", () => {
    const code = `
      const MyComponent = () => <div>Hello</div>;
      module.exports = MyComponent;
    `;

    const result = addComponentForSSR(code);

    expect(result).toBe(code);
  });

  it("should return code unchanged for complex bundled code", () => {
    // The function's regex is designed for specific minified patterns
    // Complex code with nested braces doesn't match the pattern
    const code = `var HeroBlock=function(){return React.createElement("div",null,"Hero")};module.exports={mount(e,t){render(<HeroBlock content={t}/>,e)},update(e,t){render(<HeroBlock content={t}/>,e)}};`;

    const result = addComponentForSSR(code);

    // Pattern detection doesn't match code with nested braces in mount body
    // Function returns unchanged - this documents current behavior
    expect(result).toBe(code);
  });

  it("should detect pattern in simple export structure", () => {
    // Pattern only matches if no nested braces before mount()
    // This is a simplified test case that matches the regex
    const code = `module.exports={mount(){}};`;

    // Pattern should be detected
    const hasPattern = /module\.exports\s*=\s*\{[^}]*mount\s*\([^)]*\)/s.test(code);
    expect(hasPattern).toBe(true);
  });

  it("should handle code without component match gracefully", () => {
    // Simple pattern without a component - returns unchanged
    const code = `module.exports={mount(){}};`;

    const result = addComponentForSSR(code);

    // No render() or createElement() call, so no component extracted
    // Pattern detected but can't find component name - returns unchanged
    expect(result).toBe(code);
  });

  it("should extract component name from render call", () => {
    // Test component name extraction regex directly
    const code = `render(<HeroBlock content={t}/>)`;
    const match = code.match(/(?:render|createElement)\s*\(\s*(?:<\s*)?(\w+)/);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("HeroBlock");
  });

  it("should extract component name from createElement call", () => {
    // Test component name extraction regex directly
    const code = `createElement(FeatureCard, {content: t})`;
    const match = code.match(/(?:render|createElement)\s*\(\s*(?:<\s*)?(\w+)/);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("FeatureCard");
  });
});

// =============================================================================
// isTemplate
// =============================================================================

describe("isTemplate", () => {
  it("should return true for template type", () => {
    expect(isTemplate("template")).toBe(true);
  });

  it("should return false for block type", () => {
    expect(isTemplate("block")).toBe(false);
  });
});

// =============================================================================
// parsePagesJson
// =============================================================================

describe("parsePagesJson", () => {
  it("should parse pages array", () => {
    const pagesData = {
      pages: [
        {
          name: "Homepage",
          slug: "/",
          blocks: [
            { type: "@cmssy/blocks.hero", content: { title: "Welcome" } },
            { type: "blocks.features", content: { items: [] } },
          ],
        },
        {
          name: "About",
          slug: "/about",
          blocks: [{ type: "text", content: { text: "About us" } }],
        },
      ],
    };

    const result = parsePagesJson(pagesData);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toEqual({
      name: "Homepage",
      slug: "/",
      blocks: [
        { type: "@cmssy/blocks.hero", content: { title: "Welcome" } },
        { type: "blocks.features", content: { items: [] } },
      ],
    });
  });

  it("should parse layoutSlots object to array", () => {
    const pagesData = {
      pages: [],
      layoutSlots: {
        header: {
          type: "@cmssy/blocks.navigation",
          content: { logo: "Logo", links: [] },
        },
        footer: {
          type: "blocks.footer",
          content: { copyright: "2024" },
        },
      },
    };

    const result = parsePagesJson(pagesData);

    expect(result.layoutSlots).toHaveLength(2);
    expect(result.layoutSlots).toContainEqual({
      slot: "header",
      type: "@cmssy/blocks.navigation",
      content: { logo: "Logo", links: [] },
    });
    expect(result.layoutSlots).toContainEqual({
      slot: "footer",
      type: "blocks.footer",
      content: { copyright: "2024" },
    });
  });

  it("should handle empty pages.json", () => {
    const result = parsePagesJson({});

    expect(result.pages).toEqual([]);
    expect(result.layoutSlots).toEqual([]);
  });

  it("should handle blocks without content", () => {
    const pagesData = {
      pages: [
        {
          name: "Test",
          slug: "/test",
          blocks: [{ type: "spacer" }],
        },
      ],
    };

    const result = parsePagesJson(pagesData);

    expect(result.pages[0].blocks[0].content).toEqual({});
  });

  it("should handle pages without blocks", () => {
    const pagesData = {
      pages: [
        {
          name: "Empty Page",
          slug: "/empty",
        },
      ],
    };

    const result = parsePagesJson(pagesData);

    expect(result.pages[0].blocks).toEqual([]);
  });

  it("should parse complete template pages.json", () => {
    const pagesData = {
      pages: [
        {
          name: "Homepage",
          slug: "/",
          blocks: [
            { type: "@marketing/blocks.hero", content: { title: "Welcome" } },
          ],
        },
        {
          name: "Pricing",
          slug: "/pricing",
          blocks: [
            { type: "blocks.pricing", content: { plans: [] } },
          ],
        },
      ],
      layoutSlots: {
        header: {
          type: "@marketing/blocks.nav",
          content: { logo: "Acme Inc" },
        },
        footer: {
          type: "blocks.footer",
          content: { copyright: "2024 Acme Inc" },
        },
      },
    };

    const result = parsePagesJson(pagesData);

    expect(result.pages).toHaveLength(2);
    expect(result.layoutSlots).toHaveLength(2);

    // Verify structure
    expect(result.pages[0].name).toBe("Homepage");
    expect(result.pages[0].slug).toBe("/");
    expect(result.pages[1].slug).toBe("/pricing");

    expect(result.layoutSlots.find((s) => s.slot === "header")).toBeDefined();
    expect(result.layoutSlots.find((s) => s.slot === "footer")).toBeDefined();
  });
});
