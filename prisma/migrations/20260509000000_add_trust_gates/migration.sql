-- CreateTable
CREATE TABLE "trust_gates" (
    "id" TEXT NOT NULL,
    "gateKey" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "orgContext" JSONB NOT NULL,
    "trustCtx" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_gates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trust_gates_gateKey_key" ON "trust_gates"("gateKey");

-- CreateIndex
CREATE INDEX "trust_gates_gateKey_idx" ON "trust_gates"("gateKey");

-- CreateIndex
CREATE INDEX "trust_gates_expiresAt_idx" ON "trust_gates"("expiresAt");
