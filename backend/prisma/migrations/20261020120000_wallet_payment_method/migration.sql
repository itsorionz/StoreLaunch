-- Wallet + payment method
CREATE TYPE "WalletTxType" AS ENUM ('GIFT', 'ORDER_PAYMENT', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'GATEWAY');

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");
CREATE INDEX "WalletTransaction_orderId_idx" ON "WalletTransaction"("orderId");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "walletPaidCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'GATEWAY';
