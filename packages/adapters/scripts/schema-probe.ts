import { Outline } from "@storytime/domain";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
console.log(JSON.stringify(toJsonSchema(Outline), null, 1).slice(0, 900));
