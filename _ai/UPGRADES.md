# Upgrading Zod-Stream to Zod 4 and Performance Optimization

This document outlines the proposed changes and upgrades to the `instructor-js` package along with changes and 
upgrade to its dependencies which would be incorporated into the instructor-js package. This fork of the 
original `instructor-js` package has a focus on streaming, and performance optimization to the supporting 
dependencies.

## Aligning Zod-Stream with Zod4

Zod version 4 introduces significant improvements and breaking changes that affect `zod-stream`. Crucially, **Zod4
provides native JSON Schema conversion**, eliminating the need for the external `zod-to-json-schema` dependency. To
update **zod-stream** for Zod4, you should:

### **Replace `zod-to-json-schema` usage with Zod4's built-in conversion:**

Use `z.toJSONSchema()` (or `.toJSON()`) on your Zod schema to generate the JSON Schema for OpenAI or other uses. This
allows you to drop the `zod-to-json-schema` package entirely, resolving compatibility issues (Zod4 broke that library’s
internals). Removing this dependency simplifies the library and avoids errors like missing `ZodFirstPartyTypeKind`.

### **Update any deprecated Zod API usage:**

Zod4 changed some APIs (e.g. error customization now uses a unified `error` parameter instead of `message`, dropped
`invalid_type_error`/`required_error`, etc.). If `zod-stream` or `schemaStream` uses these features for validation
messages or default values, adjust to the new syntax. In most cases, core schema definitions (`z.object`, `z.string`,
etc.) remain the same, so your schema definitions likely need minimal changes aside from JSON schema conversion.

### **Leverage Zod4 performance gains:**

Zod4 includes deep internal optimizations making parsing **up to 3× faster** and the bundle ~57% smaller. This means
schema validation during streaming will be more efficient by default. After upgrading, you can feel confident that
on-the-fly validation (each time a value is parsed) will incur less overhead than before. No code change is required to
get these benefits, but it’s a strong reason to upgrade.

### **Adjust TypeScript types if needed:**

If `zod-stream` accessed any internal Zod types or issue codes (which Zod3 exported but Zod4 reorganized), you may need
to update those references. For example, Zod4 merges some issue types (like enum or literal issues) into a generic
“invalid value” issue. Ensure that any error-handling logic in instructor-js still works with Zod4’s `ZodError`
structure (most common patterns should continue working).

Overall, **migrating to Zod4 will modernize zod-stream**. You can drop a third-party library thanks to Zod’s new
`.toJSONSchema()` support and enjoy improved validation performance out of the box. Be prepared for minor breaking
changes in how errors are configured, but since you’re open to breaking backwards compatibility, these adjustments are
acceptable.

---

## Restructuring the Streaming Output Data Shape

The current output shape from instructor-js (zod-stream) intermixes parsed data fields with metadata (the `_meta`
property). You want to refactor this so that **actual data and metadata are cleanly separated**, yielding a structure
like:

```ts
type DataStream = {
  data: T[],       // parsed data pieces (matching schema type)
  _meta ? : CompletionMeta  // metadata about streaming state
}
```

This change will make it easier to consume streaming results without manually stripping out metadata. Here’s how you can
implement the new shape:

### **Collect parsed values into a `data` array:**

Instead of outputting an object that directly contains fields as they are parsed, have the stream output an object with
a `data` property. For each streaming update, populate `data` with the newly available values (or partial objects) that
have just been parsed. In many cases, one field or sub-object completes at a time, so `data` may be an array of length 1
for each chunk. If multiple fields complete simultaneously (e.g. if a chunk of JSON text finishes two keys at once), you
can include both in the `data` array as separate elements. This approach cleanly separates the content from metadata and
**prevents metadata from polluting the JSON structure**. (Consumers will no longer need to delete or ignore `_meta` when
reconstructing the object.)

### **Utilize `CompletedPaths` to determine `data` contents:**

The `schemaStream` already tracks `completedPaths` (paths of keys that just finished parsing) via the `onKeyComplete`
callback. You can use this internally to know which parts of the schema became available. For each completed path,
retrieve the corresponding value from the partial result and push it into the `data` array. For example, if the path
`["someArray", 0, "name"]` just completed, you’d take that new value and output it. By gathering all values from
`completedPaths` in the current chunk, you ensure `data` includes every piece that became ready in that update.

### **Introduce a dynamic `_type` field in metadata:**

To make it easier for consumers to identify what the current update represents, add a `_type` or similar field inside
`_meta`. This can be dynamic based on the active path or context. For instance, if your top-level schema has fields like
`"outline"`, `"detailed"`, and `"title"`, you could set `_meta._type` to the name of the field that is currently being
output. This way, when the stream emits an update for the outline, `_meta._type === "outline"`. 

How the type could be set up, e.g. `'outline' | 'detailed' | 'title' | 'complete' | 'error'` - these would likely correspond to the keys or states:

- Use the property name for normal field updates (e.g. `'outline'` when the outline text is ready).
- Use a reserved `'complete'` type when the entire JSON object has been parsed and the stream is done.
- Use an `'error'` type if parsing fails or the stream ends unexpectedly (you can already detect errors in streaming and
  propagate a meta state).
- These `_type` values should be derived programmatically (dynamic) rather than hard-coded, so the library remains
  general. For top-level object keys, you can map `activePath[0]` (the current key) to the `_type`. For nested
  structures or array items, you might generalize (e.g. `_type: "item"` for array elements) or include a path
  representation.

### **Preserve `_completedPaths` and `_activePath` in metadata:** 

  In addition to `_type`, continue providing the raw
  `completedPaths` array and the current `activePath` in `_meta`. This low-level info is valuable for advanced usage (
  for example, if a consumer wants to know exactly which nested path just finished). It complements `_type` – `_type`
  gives a high-level label, while the path arrays give precise location.

By implementing this new shape, **each streamed chunk will carry an isolated piece of data along with context about that
piece**. For example, an update might look like:

```json
{
  "data": [
    {
      "outline": "Draft outline text..."
    }
  ],
  "_meta": {
    "_type": "outline",
    "_completedPaths": [
      [
        "outline"
      ]
    ],
    "_activePath": [
      "outline"
    ]
  }
}
```

Later, once fully complete, you might emit:

```json
{
  "data": [
    {
      "outline": "Draft outline text...",
      "detailed": "Expanded content...",
      "title": "Final title"
    }
  ],
  "_meta": {
    "_type": "complete",
    "_completedPaths": [
      [
        "detailed"
      ],
      [
        "title"
      ]
    ],
    "_activePath": []
  }
}
```

This final chunk would indicate the full object is now assembled (with `_type: "complete"`). Consumers can choose to
either use the incremental pieces or just take the final complete object. The **key benefits** of this restructuring are
clarity and ease of use – streaming metadata is clearly delineated, and data payloads are easier to handle (e.g. you can
simply iterate over `data` array to get new items, and ignore `_meta` if not needed).

## Performance Optimizations for the SchemaStream Tokenizer

With the output shape and Zod updated, the next focus is improving the **performance of the streaming JSON parser**
itself. The `schemaStream` tokenizer currently parses JSON text incrementally and validates it against the schema. There
are several ways to make this parsing faster and more efficient at the low level:

#### **Adopt a SAX-style state machine for parsing:**

The fastest JSON streaming parsers in JavaScript use a SAX (simple API for XML/JSON) approach – processing the input
byte-by-byte or character-by-character and emitting events or values as soon as they are recognized. A benchmark by
Ruben Taelman shows that a SAX-variant parser outperformed others significantly (1.43s versus 2.2–3.6s for other
libraries on a large JSON file). You should ensure your tokenizer is structured as a tight loop that reads incoming
chunks and keeps track of the current parsing state (inside an object, inside an array, parsing a string, etc.), rather
than, say, repeatedly calling `JSON.parse` on growing substrings (which would be very inefficient). By using a manual
state machine, you can output data as soon as a token (string, number, object, array element) is complete, which is
exactly what schemaStream aims to do. This minimizes latency and memory overhead.

### **Minimize string creation and concatenation:**

Parsing JSON often involves building up strings (for keys or values) character by character. In pure JavaScript, **avoid
expensive per-character string concatenation** in tight loops. Instead, collect characters in an array or buffer and
join them when the token is complete, or use a mutable structure. For example, if parsing a string value, push
characters into an array and `array.join('')` at the end, or use `TextDecoder` on a sliced buffer for multi-byte
sequences. This reduces constant reallocations of strings. Similarly, for numeric values, you can accumulate characters
and then use `Number()` or `parseFloat` once the number token ends, rather than updating a string or using `parseInt`
repeatedly.

### **Use direct value recognition for literals:**

The JSON literals `true`, `false`, and `null` can be recognized without building them char-by-char. As you parse, if you
detect a `t`, `f`, or `n` at the start of a token, you can directly check the next few characters and set the value to
`true/false/null` accordingly (and skip over those characters). This saves time over treating them like arbitrary
strings. A state machine can handle this easily by hard-coding those keywords. This kind of low-level optimization
avoids unnecessary string comparisons or intermediate allocations.

### **Optimize handling of chunk boundaries:**

Streaming input means a JSON token may be split across chunks (for instance, half of a string appears in one chunk and
the rest in the next). Ensure that your parser **carries over state between chunks seamlessly**. If the current chunk
ends in the middle of a token, the parser should store the partial token (e.g. the characters read so far of a string)
and resume without restarting or reparsing from scratch on the next chunk. JavaScript’s `TextDecoder` can help here: you
can call `decoder.decode(chunk, { stream: true })` on each Uint8Array chunk to get text, which will handle multi-byte
UTF-8 characters that span boundaries. Continue using a single `TextDecoder` instance across chunks so you don’t
accidentally split a multibyte character. By managing chunk boundaries carefully, you **prevent data loss or mis-parse
at chunk edges** and avoid overhead from reprocessing bytes.

### **Avoid accumulating the entire JSON in memory:**

One advantage of streaming is you don’t need to hold the whole JSON text at once. Ensure that as you parse, you **do not
keep unnecessary buffers**. The library should maintain only the state needed for the current parse context (e.g. the
partial token being built and the overall result object under construction). Prior versions of some parsers (like the
older `jsonparse` library) were fast but would build up a large buffer of the entire JSON, leading to high memory usage.
You should free or reuse buffers once they are consumed. For example, if you have a buffer for an object key or value,
reset it after the key/value is processed and emitted. Since `schemaStream` ultimately assembles the final JS object
gradually, you’ll still have that object in memory (which is necessary), but you shouldn’t also keep the full text. The
streaming approach already implies this, but it’s worth double-checking that no logic inadvertently stores all chunks or
entire JSON string internally.

### **Consider object-mode streaming to skip JSON stringification:**

Currently, zod-stream outputs chunks of JSON text that the consumer then decodes and parses back into an object. This
round-trip (object -> JSON string -> bytes -> JSON.parse -> object) is convenient for keeping the TransformStream as
byte-based, but it’s not the most efficient. If environment constraints allow, you could have the TransformStream
operate in **object mode**, emitting JavaScript objects or values directly instead of JSON text. For example, when a key
completes, you could emit the actual value or a small object containing that value, bypassing the need for the consumer
to call `JSON.parse`. This would require changes to how the stream is piped (web Streams default to bytes, but one can
manage an object stream manually). If switching fully to object mode is complex, another approach is to at least
minimize the size of JSON string emitted – for instance, emit just the new piece (`{"newKey": ...}`) and documentation
on how to merge it, but that complicates client usage. The simplest performance win might be to emit the **partial JS
object state directly** via events or callbacks, avoiding JSON serialization. This is a design decision – if sticking to
the current streaming paradigm, you might keep text output for compatibility, but it's worth noting as a potential
optimization.

### **Profile and test tokenizer changes:**

After implementing low-level tweaks, use large or complex JSON streams to benchmark improvements. Check not only overall
speed but **continuous memory usage** and garbage collection. The goal is to see lower throughput latency (each token
parsed quickly) and stable memory. According to one comparison, libraries like `clarinet` and `stream-json` strike a
good balance of speed and memory usage. Aim for similar efficiency: linear parsing time with no major memory spikes as
size grows. By iteratively profiling, you can identify any bottlenecks (for example, if using regex or heavy string ops
anywhere, those would show up).
In summary, focus on **tight, low-level processing of the JSON stream**. By doing so, you’ll achieve faster tokenization
and validation. Removing overhead like repeated JSON (de)serialization and using efficient string/number parsing will
make `schemaStream` more competitive with the fastest streaming parsers out there. The combination of these
optimizations with Zod4’s own speedups should yield a noticeably snappier streaming experience.

---

## Adapting to OpenAI’s New Responses API & Structured Outputs

This is the rational of why zod-stream is still relevant and should be improved

### **Why is zod-stream still relevant?**

OpenAI’s latest **Responses API** (the successor to the Chat Completions API) now natively supports structured outputs
with schema integration. This means the official SDK can directly use a Zod schema (or Pydantic in Python) to constrain
and parse the model’s output. OpenAI’s documentation notes that the **Node and Python SDKs have built-in support**: you
can supply a schema object and the SDK will convert it to JSON Schema, enforce the model’s response format, and
automatically give you a parsed result back into your data type. In practice, using the new API involves calling a
special `parse` method with your schema (e.g. `openai.beta.chat.completions.parse` in Node) instead of the usual chat
completion call. The result you get is a **fully formed JSON object matching your schema**, without needing to manually
parse or validate – the SDK handles that.

This advancement does overlap with what `zod-stream` was designed for, especially for OpenAI usage. If you use the
Responses API in non-streaming mode, the model will return a JSON that fits your schema, and the SDK will **give it to
you as a typed object** (or throw an error if it doesn’t match). In such a case, an extra layer like instructor-js might
be redundant for final output parsing. However, there are a few considerations that mean `zod-stream` (or a similar
wrapper) can still be valuable:

#### **Streaming partial results vs. final parse:**

The official structured output support is great for final results but does **not provide intermediate updates** during
streaming. OpenAI’s `parse` endpoint, as currently implemented, waits for the complete response to assemble the JSON and
validate it. If you call the API with `stream: true` and a schema, the Node SDK doesn’t yet emit parsed partial objects
for each chunk – you would receive incremental JSON text in the stream and then a final parsed object at the end. This
means if your application needs to display or process the answer _as it’s being generated (field by field)_, you still
need to manually handle the stream. A library like `schemaStream` fills this gap by **parsing the JSON stream on the fly
** and giving you data piece by piece (with the metadata for which piece). OpenAI’s SDK leaves developers to aggregate
and parse tokens themselves in streaming mode, so your wrapper can automate that and track field completion events.

#### **Maintaining functionality across providers:**

If your project might use other LLMs or APIs (which don’t have OpenAI’s structured output feature), `zod-stream` remains
a general solution. The OpenAI Responses API is proprietary; other models (or even open-source LLMs) may still require
you to coerce outputs into JSON via prompt engineering and then parse them. Having your own streaming parser means you
can offer structured streaming for any text-generating source. By updating and open-sourcing your library, you make it
useful for a wider community beyond just OpenAI’s new API.

#### **Enhanced progress metadata:**

Even if OpenAI’s SDK eventually supports streaming parsed output, it may not annotate the output with rich metadata like
`_completedPaths` or custom `_type` labels. Your implementation provides **fine-grained progress info** (which key
finished, active path, etc.) that a generic SDK likely wouldn’t expose. For example, you could start rendering the
“outline” section of a response as soon as the model finishes that part, while it’s still generating others. This level
of control is a unique advantage of your approach.

#### **Simplified wrapper around OpenAI streaming:**

You can still use OpenAI’s structured output feature in conjunction with your library. For instance, you might pass the
Zod schema to OpenAI (so the model is guided to produce valid JSON) but also pipe the streaming text through
`schemaStream` to get incremental parsing. This is somewhat redundant, but the schema serves two purposes: guiding the
model and validating each token as you parse. Since you’re fine with breaking changes and targeting cutting-edge usage,
you could align `withResponseModel`/`OAIStream` in your lib to use the new endpoint under the hood. Essentially, your
library could become a thin layer that calls `openai.responses.create` (or `.parse`) and still yields the nice
progressive interface. Just note that if using `responses.parse` directly, you might not get token-by-token updates –
instead, you may call the lower-level `responses.create` with `stream: true` and handle it similarly to now, but
possibly with simpler prompts because the model is guaranteed to stick to JSON format.

#### **Summary:**

**In summary, OpenAI’s new structured output API reduces the need for manual JSON parsing for final results**, but it
doesn’t entirely obsolete what you’re doing. You should position `instructor-js` (or your fork of it) as a complementary
tool: when a developer needs real-time partial data or is working with streaming in a nuanced way, your library provides
capabilities the base SDK doesn’t. You might update your documentation to highlight this: for pure final structured
results, one can use OpenAI’s built-in parsing (less code to maintain); but for streaming and custom integration, your
library offers more flexibility. By updating to Zod4 and improving performance, you ensure that using your library
introduces minimal overhead – making it a viable choice even when the official solution exists.

Finally, embracing OpenAI’s changes publicly (as you plan to do by open-sourcing the updated library) has additional
benefits: it **demonstrates support for open-source and modern best practices**, which can attract community
contributions. You might even gather ideas or help for further improvements by sharing this project. By keeping the
library up-to-date with Zod4 and aligning it with the latest OpenAI API capabilities, you’ll make it useful for both
cutting-edge OpenAI applications and more general LLM streaming scenarios going forward.

**Sources:**

1. OpenAI – _“Introducing Structured Outputs in the API”_ (official blog announcement) – Notes that the OpenAI Node SDK
   now accepts a Zod schema and auto-generates/parses JSON output into that schema.
2. Zod Documentation – _“JSON Schema”_ (Zod4) – Explains Zod4’s native JSON Schema conversion (removing the need for
   zod-to-json-schema) and mentions performance improvements in the new version.
3. Ruben Taelman’s JSON Parser Benchmark – _“Performance measurements of streaming JSON parsers”_ – Compares various
   Node JSON streaming parsers (stream-json, jsonparse, clarinet, etc.), showing the speed/memory trade-offs and the
   advantage of SAX-style parsing for performance.
4. Dana Hooshmand – _“Using Zod and zodResponseFormat with OpenAI”_ – Describes how to call the OpenAI Responses API
   with `chat.completions.parse` and notes that the response comes back as a JSON object (implying parsing occurs after
   the full response is received). This illustrates the difference between OpenAI’s final parsed output vs. needing a
   custom stream parser for incremental data.

---

## Additional Improvements

Along with the improvements shown above here are a few more objectives I would like to accomplish

### Unification of Tools

The current version of instructor uses function calling, Tool calling and JSON mode there are multiple modes that
essentially accomplish the same thing. If we want to be semantically correct, function calling and tool calling are the
same thing, and tool calling seems to be the way everyone is leaning, it is mean to return params that are to be passed
into a function, that function then gets called and the results are passed back to the model. JSON mode and or
structured outputs are when you just want structured json back and are not going to be passing those inputs into a
function. If we decide to make the library more `Agentic` then we should have Tool Calling and Structured output mode
and that's it

### Remove non-streamable modes

There is currently modes that get the model to output Markdown with JSON inside of a code fence. There are some
disadvantages to this, the main one being that you cannot stream these kinds of outputs. These were a work around to try
and get structured outputs from models that had poor or no json outputs compatibility. These are a product of the Claude
2, GPT 3.5 turbo, and Llama 2 era and are not necessary anymore, they also don't align with this fork being a version
that has a focus on streaming and should be removed

### XML Parsing

Anthropic introduced their version of function calling that used xml tags instead of JSON data for getting structured
outputs. While the JSON version is the popular way of having a LLM return structured data, the XML version actually has
better performance and is streamable by any model that can stream. This is a solved problem, mainly by the fact that
this is what Cursor, Windsurf and other of the big editors use to stream tokens to the UI in Code editors. Roo-Code /
Cline has a very battle tested and stable version of this that I would like to add to the library for better model
compatibility. This does support streaming and gives the user the "best of both worlds". We would need to decide how we
would want to handle this, but we should probably take the json schema and parse it into the desired XML format and then
parse the XML based response back into JSON data. This requires some more thought and planning to get right.

### Agentic Response Handling

Current iterations of LLM's are starting to move to wards interleaved responses, this is something that was pioneered by
Anthropic and is a big reason Claude 3.5 became the coding agent of choice. Rather than doing back and forth my turn
your turn flows, this allows the model to send signal back in unstructured plain text to the user mainly for feedback
purposes. You can have multiple plain text responses interleaved with tool calls before the `done` token is sent back.
Instructor in its current form is not designed to handle these interleaved tool calls as it was mainly designed for
structured data outputs. However I believe with some minor adjustments This library could become invaluable for handling
these kinds of scenario's. We already have metadata coming back from zod stream, when a response is meant to call a tool
a this could be handled with a simple callback and the value returned from the tool call can be fed back into the LLM
automatically. along with the having the plain text streamed back to the client, preferably inside of a json object for
easy handling on the client side.

### Websockets Native

For anyone that had had to mess around with SSE on the client side they know that it can feel complicated. SSE is
persistent but it's only a one way connection. It's fine for streaming back to the client but again it's only the one
way. This means when you send a message to the API you need to make another connection. Websockets solve this, by no
only handling larger bandwidths of data more easily, but you also get a persistent two way connection. This type of
connection always was the better connection as you're just handling simple text messages back and forth that you can use
right away, no need to put together a complicated reader to read and parse the SSE into text. This is just another
unnecessary layer of complexity. Another reason the SSE has been pushed over Websockets is that it is poorly supported
by Serverless technology. Serverless is fine but it has held back the simplification of streaming to the client.
Companies like Vercel didn't even support Websockets on serverless because of the extremely high cost of keeping that
connection open on Lambda functions. Cloudflare workers however does not have this problem as worker's are fundamentally
different than Lambda functions. The details of Serverless vrs Conventional vrs Workers is outside of the scope of this,
the landscape is starting to change and become more Websockets friendly and because of this, I think this should become
a first class citizen an the next proposal ties into this.

### Client Side Parsing

Instructor in its current form is a server side library, it yields complete JSON structures which then need to be parsed
on the client and used however you see fit. Handling this data on the client is no easy task. The Island AI library
includes a couple of React Hooks to make this easier but these hooks are not included with instructor as they are out of
its scope and purpose. What I would like to do is include platform agnostic hooks, these can be used by any framework
you want and they should make working with JSON data on the client easy. We can make them Websockets native, and use
libraries from the UnJS collection to help keep them cross platform compatible, this means it would work with Cloudflare
workers but it would also work with Vercel or Standard node setups. The question then becomes, Do we include the hooks
in the Instructor package, because if they aren't used they can be tree shaken out of the bundle, or do we increase the
maintenance overhead and make them a second package that is a companion to this library. I think that this should be
added regardless as this is meant as a streaming first library and what good is streaming if you have to build some
complex logic on the front end.

### Following Proven Practices

Roo-Code/Cline is a successful battle tested extension that turns VSCode into a coding agent. It's open source and
community driven. we should examine their methods and see what we can glean from their work. Streaming using XML is
interesting, the way they have LLM providers setup is quite interesting.

## Outside of the scope of this project but Still interesting

I am currently working on ways to improve how we can render dynamic UI, this is something that hasn't been solved, and
the scope of how many dynamic elements get do users want to have on their interface remains to be seen. I think the fact
that many are focusing their efforts on React here is a problem because in my experience React is probably the hardest
framework of them all to get working well with dynamic UI, there are issues with state management, there are issues with
to many re-rendering elements that are hard to overcome especially when you can't use a compiler step. This severely
limits what you can do and I think this problem needs to looked at from a different angle. I believe this library could
become a core component of dynamic UI in the future.

Special thanks to [Dimitri Kennedy](https://github.com/dimitri) for creating the original zod-stream package
and to [Jason Liu](https://github.com/InstructorAI) for the original `instructor-js` package.
and to the creator of [Zod](https://github.com/colinhacks/zod) and to all the contributors to all of these packages.

It is because of these packages that this version was born and I am really grateful for them.
