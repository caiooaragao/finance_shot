import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { isTransientDbError } from "./prisma";

test("57P01 é queda de conexão, não SQL inválido", () => {
  const error = new Prisma.PrismaClientKnownRequestError(
    "Raw query failed. Code: `57P01`. Message: `FATAL: terminating connection due to administrator command`",
    {
      code: "P2010",
      clientVersion: "0.0.0",
      meta: { code: "57P01", message: "FATAL: terminating connection due to administrator command" },
    },
  );
  assert.equal(isTransientDbError(error), true);
});

test("erro de sintaxe SQL não dispara reconexão", () => {
  const error = new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `42601`.", {
    code: "P2010",
    clientVersion: "0.0.0",
    meta: { code: "42601", message: "syntax error" },
  });
  assert.equal(isTransientDbError(error), false);
});
