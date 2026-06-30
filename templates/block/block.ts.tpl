import { defineBlock, fields } from "@cmssy/react";
import {{Pascal}} from "./{{Pascal}}";

export const {{camel}}Block = defineBlock({
  type: "{{type}}",
  label: "{{Label}}",
  component: {{Pascal}},
  props: {
    heading: fields.singleLine({ label: "Heading" }),
  },
});
