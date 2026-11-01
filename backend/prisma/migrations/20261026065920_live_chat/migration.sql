-- CreateEnum
CREATE TYPE "ChatConversationStatus" AS ENUM ('Open', 'Closed');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CustomerService';

-- AlterTable
ALTER TABLE "AccountStatusEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "AfterSalesRequest" ALTER COLUMN "requestedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "AuthRecoveryRequest" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CareerApplication" ALTER COLUMN "consentAcceptedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CareerJob" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CarouselSlide" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CodCollection" ALTER COLUMN "collectedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CodSettlement" ALTER COLUMN "receivedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "ContactVerificationOtp" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryAttempt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryCompany" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryProof" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Feedback" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "InboxMessage" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "InventoryAdjustment" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "License" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "LoginChallenge" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "OrderEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PasswordResetChallenge" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PaymentAttempt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PhoneOtp" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Promotion" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Referral" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "RefundRecord" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Rider" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "RiderReview" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StockNotification" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StoreSettings" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "WalletTransaction" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wishlist" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerServiceId" TEXT,
    "status" "ChatConversationStatus" NOT NULL DEFAULT 'Open',
    "subject" TEXT,
    "orderId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversation_status_lastMessageAt_idx" ON "ChatConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_customerId_status_idx" ON "ChatConversation"("customerId", "status");

-- CreateIndex
CREATE INDEX "ChatConversation_customerServiceId_status_idx" ON "ChatConversation"("customerServiceId", "status");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_senderRole_readAt_idx" ON "ChatMessage"("conversationId", "senderRole", "readAt");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_customerServiceId_fkey" FOREIGN KEY ("customerServiceId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
