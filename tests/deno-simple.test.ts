// Simple Deno environment test
// @ts-ignore - Deno standard library import
import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

// @ts-ignore - Deno global types
declare const Deno: any;

Deno.test("Deno runtime environment", () => {
  // Test that we can detect we're running in Deno
  const isDeno = typeof Deno !== "undefined";
  assertEquals(isDeno, true);
});

Deno.test("Deno has required APIs", () => {
  // Test that we can access Deno APIs
  assertExists(Deno.env);
  assertExists(Deno.version);
});

Deno.test("Basic console functionality", () => {
  // Test basic console functionality that our logger would use
  assertExists(console.log);
  assertExists(console.error);
  assertExists(console.warn);
  assertExists(console.info);
  
  // Test that we can call console methods without errors
  console.log("Deno test log message");
  console.info("Deno test info message");
  console.warn("Deno test warn message");
  console.error("Deno test error message");
});