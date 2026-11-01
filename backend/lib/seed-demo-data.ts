import {
  AfterSalesKinds,
  AfterSalesStatuses,
  AddressTypes,
  CareerApplicationStatuses,
  CareerEmploymentTypes,
  CareerJobStatuses,
  CareerWorkplaceModes,
  CodSettlementMethods,
  InboxCategories,
  OrderEventTypes,
  OrderStatuses,
  OrderCurrencySources,
  PaymentAttemptStatuses,
  PaymentMethods,
  PromotionAudiences,
  PromotionStatuses,
  RefundStatuses,
  RefundTenders,
  ReviewStatuses,
  Roles,
  WalletTransactionTypes,
} from "@backend/lib/enums.mjs";
import type { PrismaClient } from "@backend/generated/prisma/client";
import bcrypt from "bcryptjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

/**
 * Development-only workflow fixtures. These are deliberately separate from
 * seedCatalog because first-run store setup must never create fake orders,
 * customers, or financial records for a real store owner.
 */
export async function seedDemoOperations(db: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo operations seeding is disabled in production.");
  }

  const passwordHash = await bcrypt.hash("customer1234", 10);
  const customerData = [
    {
      email: "customer@store.local",
      name: "Ayesha Rahman",
      phone: "+8801712345678",
      referralCode: "AYESHA40",
    },
    {
      email: "customer2@store.local",
      name: "Tanvir Ahmed",
      phone: "+8801812345678",
      referralCode: "TANVIR40",
    },
    {
      email: "customer3@store.local",
      name: "Nusrat Jahan",
      phone: "+8801912345678",
      referralCode: "NUSRAT40",
    },
  ];
  const customers = await Promise.all(
    customerData.map((customer) =>
      db.user.upsert({
        where: { email: customer.email },
        update: {
          name: customer.name,
          phone: customer.phone,
          referralCode: customer.referralCode,
          passwordHash,
          roles: [Roles.Customer],
          active: true,
        },
        create: {
          ...customer,
          passwordHash,
          roles: [Roles.Customer],
          gender: "female",
        },
      }),
    ),
  );
  const [customer, referredCustomer, otherCustomer] = customers;
  const inactiveCustomer = await db.user.upsert({
    where: { email: "inactive-customer@store.local" },
    update: { active: false, roles: [Roles.Customer] },
    create: {
      email: "inactive-customer@store.local",
      name: "Demo Inactive Customer",
      passwordHash: await bcrypt.hash("customer1234", 10),
      roles: [Roles.Customer],
      active: false,
    },
  });
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@store.local" } });
  const riderUser = await db.user.upsert({
    where: { email: "rider@store.local" },
    update: {},
    create: {
      email: "rider@store.local",
      name: "Sagar Khan",
      phone: "+8801617896767",
      passwordHash: await bcrypt.hash("rider1234", 10),
      roles: [Roles.Rider],
    },
  });
  const rider = await db.rider.upsert({
    where: { userId: riderUser.id },
    update: { name: riderUser.name, phone: riderUser.phone ?? "+8801617896767", active: true },
    create: {
      userId: riderUser.id,
      name: riderUser.name,
      phone: riderUser.phone ?? "+8801617896767",
    },
  });
  const inactiveRider = await db.rider.upsert({
    where: { id: "demo-inactive-rider" },
    update: { name: "Demo Rider (Inactive)", phone: "+8801711111111", active: false },
    create: {
      id: "demo-inactive-rider",
      name: "Demo Rider (Inactive)",
      phone: "+8801711111111",
      active: false,
    },
  });
  await db.user.upsert({
    where: { email: "support@store.local" },
    update: { roles: [Roles.Customer, Roles.Support], active: true },
    create: {
      email: "support@store.local",
      name: "Farhana Islam",
      phone: "+8801555666777",
      passwordHash: await bcrypt.hash("support1234", 10),
      roles: [Roles.Customer, Roles.Support],
    },
  });

  const addressData = [
    {
      id: "demo-address-ayesha-home",
      userId: customer.id,
      name: customer.name,
      phone: customer.phone!,
      type: AddressTypes.HOME,
      line1: "House 27, Road 11, Dhanmondi",
      line2: "Near Dhanmondi Lake",
      city: "Dhaka",
      region: "Dhaka",
      postal: "1209",
      isDefault: true,
    },
    {
      id: "demo-address-tanvir-office",
      userId: referredCustomer.id,
      name: referredCustomer.name,
      phone: referredCustomer.phone!,
      type: AddressTypes.OFFICE,
      line1: "Level 5, House 12, Road 3",
      line2: "Uttara Sector 4",
      city: "Dhaka",
      region: "Dhaka",
      postal: "1230",
      isDefault: true,
    },
    {
      id: "demo-address-nusrat-home",
      userId: otherCustomer.id,
      name: otherCustomer.name,
      phone: otherCustomer.phone!,
      type: AddressTypes.HOME,
      line1: "Flat B2, House 8, Road 6",
      city: "Mirpur",
      region: "Dhaka",
      postal: "1216",
      isDefault: true,
    },
  ];
  for (const address of addressData) {
    await db.address.upsert({ where: { id: address.id }, update: address, create: address });
  }

  const wallet = await db.wallet.upsert({
    where: { userId: customer.id },
    update: { balanceCents: 4000 },
    create: { userId: customer.id, balanceCents: 4000 },
  });
  if (!(await db.walletTransaction.findUnique({ where: { id: "demo-wallet-referral-reward" } }))) {
    await db.walletTransaction.create({
      data: {
        id: "demo-wallet-referral-reward",
        walletId: wallet.id,
        amountCents: 4000,
        balanceAfterCents: 4000,
        type: WalletTransactionTypes.ReferralReward,
        note: "Demo referral reward",
        createdAt: ago(8),
      },
    });
  }
  await db.wallet.upsert({
    where: { userId: referredCustomer.id },
    update: {},
    create: { userId: referredCustomer.id, balanceCents: 0 },
  });

  const deliveryCompany = await db.deliveryCompany.upsert({
    where: { id: "demo-delivery-company" },
    update: { name: "StoreLaunch Delivery", phone: "+8801700000000", active: true },
    create: {
      id: "demo-delivery-company",
      name: "StoreLaunch Delivery",
      phone: "+8801700000000",
      trackingUrl: "https://example.com/track/{trackingNumber}",
    },
  });

  const outOfStockProduct = await db.product.upsert({
    where: { slug: "demo-out-of-stock-apricots" },
    update: {
      name: "Dried Apricots (Out of Stock)",
      nameBn: "শুকনা এপ্রিকট (স্টকে নেই)",
      description:
        "Development fixture used to verify unavailable stock and restock notifications.",
      descriptionBn: "স্টক শেষ হলে পুনরায় মজুতের বিজ্ঞপ্তি যাচাইয়ের জন্য ডেভেলপমেন্ট পণ্য।",
      stock: 0,
      images: [
        "/products/photo-dates.webp",
        "/products/photo-raisins.webp",
        "/products/photo-walnuts.webp",
      ],
    },
    create: {
      name: "Dried Apricots (Out of Stock)",
      nameBn: "শুকনা এপ্রিকট (স্টকে নেই)",
      slug: "demo-out-of-stock-apricots",
      description:
        "Development fixture used to verify unavailable stock and restock notifications.",
      descriptionBn: "স্টক শেষ হলে পুনরায় মজুতের বিজ্ঞপ্তি যাচাইয়ের জন্য ডেভেলপমেন্ট পণ্য।",
      priceCents: 99000,
      stock: 0,
      images: [
        "/products/photo-dates.webp",
        "/products/photo-raisins.webp",
        "/products/photo-walnuts.webp",
      ],
      active: true,
      category: { connect: { slug: "dates-dry-fruits" } },
      brand: { connect: { slug: "nutri-harvest" } },
    },
  });

  const productRows = await db.product.findMany({
    where: {
      slug: {
        in: [
          "kashmiri-red-chili-powder-200g",
          "sundarbans-wildflower-honey-500g",
          "premium-cashew-nuts-250g",
          "spice-honey-gift-box",
        ],
      },
    },
  });
  const products = new Map(productRows.map((product) => [product.slug, product]));
  const chiliPowder = products.get("kashmiri-red-chili-powder-200g");
  const honey = products.get("sundarbans-wildflower-honey-500g");
  const cashews = products.get("premium-cashew-nuts-250g");
  const giftBox = products.get("spice-honey-gift-box");
  if (!chiliPowder || !honey || !cashews || !giftBox) {
    throw new Error("Run catalog seeding before demo operations seeding.");
  }

  const orderDefinitions = [
    {
      number: "DEMO-ORD-DELIVERED-COD",
      status: OrderStatuses.Delivered,
      user: customer,
      addressId: "demo-address-ayesha-home",
      product: chiliPowder,
      quantity: 2,
      paymentMethod: PaymentMethods.COD,
      daysAgo: 2,
      riderId: rider.id,
      paidAt: ago(2),
      shippedAt: ago(2),
      deliveredAt: ago(2),
      additionalInfo: "Please call when you arrive at the building gate.",
    },
    {
      number: "DEMO-ORD-DELIVERED-ONLINE",
      status: OrderStatuses.Delivered,
      user: referredCustomer,
      addressId: "demo-address-tanvir-office",
      product: cashews,
      quantity: 1,
      paymentMethod: PaymentMethods.GATEWAY,
      daysAgo: 9,
      riderId: rider.id,
      paidAt: ago(9),
      shippedAt: ago(9),
      deliveredAt: ago(9),
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-ON-ROUTE",
      status: OrderStatuses.Shipped,
      user: customer,
      addressId: "demo-address-ayesha-home",
      product: honey,
      quantity: 1,
      paymentMethod: PaymentMethods.COD,
      daysAgo: 0,
      riderId: rider.id,
      paidAt: null,
      shippedAt: ago(0),
      deliveredAt: null,
      additionalInfo: "Office is closed after 6 PM.",
    },
    {
      number: "DEMO-ORD-PACKED",
      status: OrderStatuses.Packed,
      user: otherCustomer,
      addressId: "demo-address-nusrat-home",
      product: giftBox,
      quantity: 1,
      paymentMethod: PaymentMethods.COD,
      daysAgo: 0,
      riderId: null,
      paidAt: null,
      shippedAt: null,
      deliveredAt: null,
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-DELIVERED-COD-SETTLED",
      status: OrderStatuses.Delivered,
      user: otherCustomer,
      addressId: "demo-address-nusrat-home",
      product: honey,
      quantity: 1,
      paymentMethod: PaymentMethods.COD,
      daysAgo: 30,
      riderId: rider.id,
      paidAt: ago(30),
      shippedAt: ago(30),
      deliveredAt: ago(30),
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-DELIVERED-TIMELINE",
      status: OrderStatuses.Delivered,
      user: customer,
      addressId: "demo-address-ayesha-home",
      product: cashews,
      quantity: 1,
      paymentMethod: PaymentMethods.GATEWAY,
      daysAgo: 0.2,
      riderId: rider.id,
      paidAt: ago(0.2),
      shippedAt: ago(0.2),
      deliveredAt: ago(0.2),
      additionalInfo: "The building entrance is beside the main gate.",
    },
    {
      number: "DEMO-ORD-PENDING-ONLINE",
      status: OrderStatuses.Pending,
      user: customer,
      addressId: "demo-address-ayesha-home",
      product: honey,
      quantity: 2,
      paymentMethod: PaymentMethods.GATEWAY,
      daysAgo: 0,
      riderId: null,
      paidAt: null,
      shippedAt: null,
      deliveredAt: null,
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-RETURN-REQUEST",
      status: OrderStatuses.Delivered,
      user: otherCustomer,
      addressId: "demo-address-nusrat-home",
      product: giftBox,
      quantity: 1,
      paymentMethod: PaymentMethods.GATEWAY,
      daysAgo: 4,
      riderId: rider.id,
      paidAt: ago(4),
      shippedAt: ago(4),
      deliveredAt: ago(4),
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-CANCELLED-REVIEW",
      status: OrderStatuses.Cancelled,
      user: referredCustomer,
      addressId: "demo-address-tanvir-office",
      product: chiliPowder,
      quantity: 1,
      paymentMethod: PaymentMethods.GATEWAY,
      daysAgo: 12,
      riderId: null,
      paidAt: null,
      shippedAt: null,
      deliveredAt: null,
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-PAID",
      status: OrderStatuses.Paid,
      user: customer,
      addressId: "demo-address-ayesha-home",
      product: chiliPowder,
      quantity: 1,
      paymentMethod: PaymentMethods.GATEWAY,
      daysAgo: 1,
      riderId: null,
      paidAt: ago(1),
      shippedAt: null,
      deliveredAt: null,
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-PROCESSING",
      status: OrderStatuses.Processing,
      user: otherCustomer,
      addressId: "demo-address-nusrat-home",
      product: honey,
      quantity: 1,
      paymentMethod: PaymentMethods.GATEWAY,
      daysAgo: 0,
      riderId: null,
      paidAt: ago(0),
      shippedAt: null,
      deliveredAt: null,
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-CONFIRMED",
      status: OrderStatuses.Confirmed,
      user: customer,
      addressId: "demo-address-ayesha-home",
      product: giftBox,
      quantity: 1,
      paymentMethod: PaymentMethods.COD,
      daysAgo: 0,
      riderId: null,
      paidAt: null,
      shippedAt: null,
      deliveredAt: null,
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-PACKING",
      status: OrderStatuses.Packing,
      user: referredCustomer,
      addressId: "demo-address-tanvir-office",
      product: cashews,
      quantity: 1,
      paymentMethod: PaymentMethods.COD,
      daysAgo: 0,
      riderId: null,
      paidAt: null,
      shippedAt: null,
      deliveredAt: null,
      additionalInfo: null,
    },
    {
      number: "DEMO-ORD-RETURNING-TO-ORIGIN",
      status: OrderStatuses.ReturningToOrigin,
      user: otherCustomer,
      addressId: "demo-address-nusrat-home",
      product: chiliPowder,
      quantity: 1,
      paymentMethod: PaymentMethods.COD,
      daysAgo: 1,
      riderId: rider.id,
      paidAt: null,
      shippedAt: ago(1),
      deliveredAt: null,
      additionalInfo: "Customer could not be reached on the first attempt.",
    },
  ] as const;

  const orderRows = new Map<string, { id: string; number: string; createdAt: Date }>();
  for (const [index, order] of orderDefinitions.entries()) {
    // Leave a small lead-in so same-day lifecycle events have ordered timestamps.
    const createdAt = ago(order.daysAgo + 0.05);
    const lineTotalCents =
      (order.product.salePriceCents ?? order.product.priceCents) * order.quantity;
    const totalCents = lineTotalCents + 8000;
    const saved = await db.order.upsert({
      where: { number: order.number },
      update: {
        status: order.status,
        subtotalCents: lineTotalCents,
        shippingCents: 8000,
        totalCents,
        paymentMethod: order.paymentMethod,
        recipientName: order.user.name,
        additionalInfo: order.additionalInfo,
        phone: order.user.phone ?? "",
        line1:
          order.user.id === referredCustomer.id ? "Level 5, House 12, Road 3" : "House 27, Road 11",
        city: "Dhaka",
        region: "Dhaka",
        postal: "1209",
        userId: order.user.id,
        addressId: order.addressId,
        riderId: order.riderId,
        deliveryCompanyId: deliveryCompany.id,
        paidAt: order.paidAt,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
      },
      create: {
        number: order.number,
        status: order.status,
        subtotalCents: lineTotalCents,
        shippingCents: 8000,
        totalCents,
        currencyCode: "BDT",
        currencySymbol: "৳",
        currencySource: OrderCurrencySources.Snapshot,
        paymentMethod: order.paymentMethod,
        recipientName: order.user.name,
        additionalInfo: order.additionalInfo,
        phone: order.user.phone ?? "",
        line1: "House 27, Road 11, Dhaka",
        city: "Dhaka",
        region: "Dhaka",
        postal: "1209",
        userId: order.user.id,
        addressId: order.addressId,
        riderId: order.riderId,
        deliveryCompanyId: deliveryCompany.id,
        paidAt: order.paidAt,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        createdAt,
      },
    });
    orderRows.set(order.number, saved);

    await db.orderItem.upsert({
      where: { id: `demo-item-${index + 1}` },
      update: {
        orderId: saved.id,
        productId: order.product.id,
        name: order.product.name,
        nameBn: order.product.nameBn,
        slug: order.product.slug,
        priceCents: order.product.salePriceCents ?? order.product.priceCents,
        quantity: order.quantity,
        imageUrl: order.product.images[0] ?? null,
      },
      create: {
        id: `demo-item-${index + 1}`,
        orderId: saved.id,
        productId: order.product.id,
        name: order.product.name,
        nameBn: order.product.nameBn,
        slug: order.product.slug,
        priceCents: order.product.salePriceCents ?? order.product.priceCents,
        quantity: order.quantity,
        imageUrl: order.product.images[0] ?? null,
      },
    });

    const orderStages = [
      { status: OrderStatuses.Pending, type: OrderEventTypes.Placed, message: "Order placed" },
      ...(order.paymentMethod === PaymentMethods.GATEWAY && order.paidAt
        ? [
            {
              status: OrderStatuses.Paid,
              type: OrderEventTypes.PaymentConfirmed,
              message: "Payment confirmed",
            },
          ]
        : []),
      { status: OrderStatuses.Processing, type: OrderEventTypes.Processing, message: "Processing" },
      { status: OrderStatuses.Confirmed, type: OrderEventTypes.Confirmed, message: "Confirmed" },
      { status: OrderStatuses.Packing, type: OrderEventTypes.Packing, message: "Packing" },
      { status: OrderStatuses.Packed, type: OrderEventTypes.Packed, message: "Packed" },
      { status: OrderStatuses.Shipped, type: OrderEventTypes.Shipped, message: "Delivering" },
      { status: OrderStatuses.Delivered, type: OrderEventTypes.Delivered, message: "Delivered" },
    ];
    const rtoStage = {
      status: OrderStatuses.ReturningToOrigin,
      type: OrderEventTypes.ReturnToOriginStarted,
      message: "Returning to origin",
    };
    const cancelledStage = {
      status: OrderStatuses.Cancelled,
      type: OrderEventTypes.Cancelled,
      message: "Cancelled",
    };
    const timelineStages =
      order.status === OrderStatuses.Cancelled
        ? [orderStages[0], cancelledStage]
        : order.status === OrderStatuses.ReturningToOrigin
          ? [...orderStages.slice(0, 7), rtoStage]
          : orderStages.slice(
              0,
              orderStages.findIndex((stage) => stage.status === order.status) + 1,
            );
    const terminalStage = timelineStages.length - 1;
    const terminalDate = order.deliveredAt ?? order.shippedAt ?? order.paidAt ?? new Date();
    for (const [stageIndex, stage] of timelineStages.entries()) {
      const eventKey =
        stageIndex === 0
          ? `demo-order-placed-${order.number}`
          : stageIndex === terminalStage
            ? `demo-order-status-${order.number}`
            : `demo-order-stage-${order.number}-${stage.status}`;
      if (await db.orderEvent.findUnique({ where: { dedupeKey: eventKey } })) continue;
      const eventDate = new Date(
        terminalDate.getTime() - (terminalStage - stageIndex) * 5 * 60_000,
      );
      const isRiderEvent =
        Boolean(order.riderId) &&
        (stage.status === OrderStatuses.Shipped ||
          stage.status === OrderStatuses.ReturningToOrigin ||
          stage.status === OrderStatuses.Delivered);
      await db.orderEvent.create({
        data: {
          orderId: saved.id,
          type: stage.type,
          actorId: stageIndex === 0 ? order.user.id : isRiderEvent ? riderUser.id : admin.id,
          actorName:
            stageIndex === 0 ? order.user.name : isRiderEvent ? riderUser.name : admin.name,
          actorRole: stageIndex === 0 ? "Customer" : isRiderEvent ? "Rider" : "Admin",
          fromStatus: stageIndex ? timelineStages[stageIndex - 1].status : null,
          toStatus: stage.status,
          message:
            stage.status === OrderStatuses.Pending
              ? `Your order #${order.number} has been placed.`
              : `Demo order is ${stage.message.toLowerCase()}.`,
          dedupeKey: eventKey,
          createdAt: eventDate,
        },
      });
    }
  }

  const deliveredCod = orderRows.get("DEMO-ORD-DELIVERED-COD")!;
  const deliveredOnline = orderRows.get("DEMO-ORD-DELIVERED-ONLINE")!;
  const routedOrder = orderRows.get("DEMO-ORD-ON-ROUTE")!;
  const settledCodOrder = orderRows.get("DEMO-ORD-DELIVERED-COD-SETTLED")!;
  const returningOrder = orderRows.get("DEMO-ORD-RETURNING-TO-ORIGIN")!;
  const returnedOrder = orderRows.get("DEMO-ORD-RETURN-REQUEST")!;
  const pendingOnline = orderRows.get("DEMO-ORD-PENDING-ONLINE")!;
  const cancelledOrder = orderRows.get("DEMO-ORD-CANCELLED-REVIEW")!;

  if (!(await db.deliveryAttempt.findUnique({ where: { id: "demo-delivery-attempt" } }))) {
    await db.deliveryAttempt.create({
      data: {
        id: "demo-delivery-attempt",
        orderId: routedOrder.id,
        riderId: rider.id,
        reason: "RESCHEDULED",
        note: "Customer requested delivery after 5 PM.",
        nextAttemptAt: new Date(Date.now() + DAY_MS),
        createdAt: ago(0),
      },
    });
  }
  if (!(await db.deliveryAttempt.findUnique({ where: { id: "demo-rto-delivery-attempt" } }))) {
    await db.deliveryAttempt.create({
      data: {
        id: "demo-rto-delivery-attempt",
        orderId: returningOrder.id,
        riderId: rider.id,
        reason: "NO_ANSWER",
        note: "No one was available to receive the package.",
        createdAt: ago(1),
      },
    });
  }
  if (!(await db.deliveryProof.findUnique({ where: { orderId: deliveredOnline.id } }))) {
    await db.deliveryProof.create({
      data: {
        orderId: deliveredOnline.id,
        riderId: rider.id,
        receivedBy: referredCustomer.name,
        relationship: "CUSTOMER",
        note: "Package handed to customer.",
        createdAt: ago(9),
      },
    });
  }

  const codCollections = [
    {
      orderId: deliveredCod.id,
      amountCents: (chiliPowder.salePriceCents ?? chiliPowder.priceCents) * 2 + 8000,
      collectedAt: ago(2),
      remittedAt: null,
      remittanceReference: null,
    },
    {
      orderId: settledCodOrder.id,
      amountCents: (honey.salePriceCents ?? honey.priceCents) + 8000,
      collectedAt: ago(30),
      remittedAt: null,
      remittanceReference: null,
    },
  ];
  for (const collection of codCollections) {
    await db.codCollection.upsert({
      where: { orderId: collection.orderId },
      update: {
        amountCents: collection.amountCents,
        currencyCode: "BDT",
        collectedById: riderUser.id,
        collectedByName: rider.name,
        collectedByRole: "Rider",
        courierName: rider.name,
        remittedAt: collection.remittedAt,
        remittedById: null,
        remittedByName: null,
        remittanceReference: collection.remittanceReference,
      },
      create: {
        ...collection,
        currencyCode: "BDT",
        collectedById: riderUser.id,
        collectedByName: rider.name,
        collectedByRole: "Rider",
        courierName: rider.name,
      },
    });
  }

  const settledCollection = await db.codCollection.findUniqueOrThrow({
    where: { orderId: settledCodOrder.id },
  });
  let settlement = await db.codSettlement.findUnique({
    where: { reference: "DEMO-STORE-RECEIPT-001" },
  });
  if (!settlement) {
    settlement = await db.codSettlement.create({
      data: {
        currencyCode: "BDT",
        method: CodSettlementMethods.BankTransfer,
        reference: "DEMO-STORE-RECEIPT-001",
        expectedCents: settledCollection.amountCents,
        receivedCents: settledCollection.amountCents,
        varianceCents: 0,
        note: "Demo completed rider cash handover.",
        receivedById: admin.id,
        receivedByName: admin.name,
        receivedAt: ago(30),
      },
    });
  }
  const settlementLine = await db.codSettlementLine.findUnique({
    where: {
      settlementId_codCollectionId: {
        settlementId: settlement.id,
        codCollectionId: settledCollection.id,
      },
    },
  });
  if (!settlementLine) {
    await db.codSettlementLine.create({
      data: {
        settlementId: settlement.id,
        codCollectionId: settledCollection.id,
        outstandingCents: settledCollection.amountCents,
        expectedCents: settledCollection.amountCents,
        receivedCents: settledCollection.amountCents,
        appliedCents: settledCollection.amountCents,
        varianceCents: 0,
      },
    });
  }

  for (const [order, status, error, days] of [
    [pendingOnline, PaymentAttemptStatuses.Ready, null, 0],
    [cancelledOrder, PaymentAttemptStatuses.ReviewRequired, "Provider confirmation delayed", 12],
  ] as const) {
    await db.paymentAttempt.upsert({
      where: { orderId: order.id },
      update: {
        status,
        requiresManualReview: status === PaymentAttemptStatuses.ReviewRequired,
        lastError: error,
      },
      create: {
        orderId: order.id,
        status,
        sessionKey: `demo-session-${order.number.toLowerCase()}`,
        gatewayUrl: "https://sandbox.sslcommerz.com/gwprocess/v4/demo",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        nextCheckAt: ago(days),
        lastCheckedAt: days ? ago(days) : null,
        lastError: error,
        requiresManualReview: status === PaymentAttemptStatuses.ReviewRequired,
        createdAt: ago(days),
      },
    });
  }

  const referral = await db.referral.upsert({
    where: { refereeId: referredCustomer.id },
    update: { qualifyingOrderId: deliveredOnline.id, rewardedAt: ago(8) },
    create: {
      referrerId: customer.id,
      refereeId: referredCustomer.id,
      rewardCents: 4000,
      currencyCode: "BDT",
      qualifyingOrderId: deliveredOnline.id,
      rewardedAt: ago(8),
      createdAt: ago(10),
    },
  });
  void referral;

  const campaign = await db.campaign.findFirst({ where: { title: "Spice Cabinet Refresh" } });
  if (campaign) {
    await db.campaignProduct.upsert({
      where: { campaignId_productId: { campaignId: campaign.id, productId: chiliPowder.id } },
      update: { offerPriceCents: chiliPowder.salePriceCents ?? chiliPowder.priceCents },
      create: {
        campaignId: campaign.id,
        productId: chiliPowder.id,
        offerPriceCents: chiliPowder.salePriceCents ?? chiliPowder.priceCents,
      },
    });
  }

  const promotion = await db.promotion.upsert({
    where: { id: "demo-promotion-sent" },
    update: { recipientCount: customers.length, status: PromotionStatuses.Sent },
    create: {
      id: "demo-promotion-sent",
      title: "Welcome offer: save on your next order",
      body: "Thanks for shopping with us. Explore this week's selected offers and enjoy great value.",
      href: "/offers",
      campaignId: campaign?.id,
      audience: PromotionAudiences.AllCustomers,
      status: PromotionStatuses.Sent,
      createdById: admin.id,
      createdByName: admin.name,
      sentById: admin.id,
      sentByName: admin.name,
      recipientCount: customers.length,
      sentAt: ago(3),
      createdAt: ago(3),
    },
  });
  const unreadCustomerIds = new Set([customer.id, otherCustomer.id]);
  for (const [index, recipient] of customers.entries()) {
    await db.inboxMessage.upsert({
      where: { userId_sourceKey: { userId: recipient.id, sourceKey: "demo-promotion-sent" } },
      update: { promotionId: promotion.id, title: promotion.title, body: promotion.body },
      create: {
        userId: recipient.id,
        category: InboxCategories.PROMOTION,
        title: promotion.title,
        body: promotion.body,
        href: "/offers",
        sourceKey: "demo-promotion-sent",
        promotionId: promotion.id,
        readAt: unreadCustomerIds.has(recipient.id) ? null : ago(1),
        createdAt: ago(3 + index),
      },
    });
  }
  await db.promotion.upsert({
    where: { id: "demo-promotion-draft" },
    update: {},
    create: {
      id: "demo-promotion-draft",
      title: "Weekend pantry refresh",
      body: "A draft promotion ready for the store owner to review and send.",
      href: "/categories/spices-masala",
      audience: PromotionAudiences.SelectedCustomers,
      selectedUserIds: [customer.id, otherCustomer.id],
      status: PromotionStatuses.Draft,
      createdById: admin.id,
      createdByName: admin.name,
      createdAt: ago(1),
    },
  });
  await db.inboxMessage.upsert({
    where: { userId_sourceKey: { userId: customer.id, sourceKey: "demo-order-update" } },
    update: {},
    create: {
      userId: customer.id,
      category: InboxCategories.NOTIFICATION,
      title: "Your order is on the way",
      body: "Your demo order has been handed to the rider.",
      href: `/account/orders/${routedOrder.number}`,
      sourceKey: "demo-order-update",
      createdAt: ago(0),
    },
  });

  const cart = await db.cart.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id },
  });
  await db.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId: honey.id } },
    update: { quantity: 1, selected: true },
    create: { cartId: cart.id, productId: honey.id, quantity: 1, selected: true },
  });
  await db.wishlist.upsert({
    where: { userId_productId: { userId: customer.id, productId: cashews.id } },
    update: {},
    create: { userId: customer.id, productId: cashews.id },
  });
  await db.stockNotification.upsert({
    where: { userId_productId: { userId: otherCustomer.id, productId: outOfStockProduct.id } },
    update: { notifiedAt: null },
    create: { userId: otherCustomer.id, productId: outOfStockProduct.id },
  });

  await db.review.upsert({
    where: { productId_userId: { productId: chiliPowder.id, userId: customer.id } },
    update: {
      rating: 5,
      body: "Easy to use and arrived on time.",
      status: ReviewStatuses.Approved,
    },
    create: {
      productId: chiliPowder.id,
      userId: customer.id,
      rating: 5,
      body: "Easy to use and arrived on time.",
      status: ReviewStatuses.Approved,
      createdAt: ago(1),
    },
  });
  await db.review.upsert({
    where: { productId_userId: { productId: honey.id, userId: otherCustomer.id } },
    update: { rating: 4, body: "A pleasant texture; waiting for moderation." },
    create: {
      productId: honey.id,
      userId: otherCustomer.id,
      rating: 4,
      body: "A pleasant texture; waiting for moderation.",
      status: ReviewStatuses.Pending,
      createdAt: ago(0),
    },
  });
  await db.riderReview.upsert({
    where: { orderId: deliveredOnline.id },
    update: { rating: 5, body: "Friendly and careful delivery." },
    create: {
      orderId: deliveredOnline.id,
      userId: referredCustomer.id,
      rating: 5,
      body: "Friendly and careful delivery.",
      createdAt: ago(8),
    },
  });
  await db.feedback.upsert({
    where: { id: "demo-feedback-delivery" },
    update: {},
    create: {
      id: "demo-feedback-delivery",
      userId: customer.id,
      kind: "suggest",
      message: "Please add an option to select a preferred delivery time.",
      rating: 4,
      createdAt: ago(2),
    },
  });

  const deliveredItem = await db.orderItem.findFirstOrThrow({
    where: { orderId: returnedOrder.id },
  });
  const afterSales = await db.afterSalesRequest.upsert({
    where: { id: "demo-return-request" },
    update: { status: AfterSalesStatuses.Requested },
    create: {
      id: "demo-return-request",
      orderId: returnedOrder.id,
      userId: otherCustomer.id,
      kind: AfterSalesKinds.Return,
      status: AfterSalesStatuses.Requested,
      reason: "Item arrived with a damaged outer box.",
      customerNote: "Please inspect the giftBox set.",
      requestedAt: ago(2),
    },
  });
  await db.afterSalesItem.upsert({
    where: { requestId_orderItemId: { requestId: afterSales.id, orderItemId: deliveredItem.id } },
    update: { requestedQuantity: 1 },
    create: { requestId: afterSales.id, orderItemId: deliveredItem.id, requestedQuantity: 1 },
  });
  await db.refundRecord.upsert({
    where: { requestId_tender: { requestId: afterSales.id, tender: RefundTenders.Wallet } },
    update: { amountCents: 1000, status: RefundStatuses.AwaitingExternal },
    create: {
      requestId: afterSales.id,
      orderId: returnedOrder.id,
      tender: RefundTenders.Wallet,
      status: RefundStatuses.AwaitingExternal,
      amountCents: 1000,
      currencyCode: "BDT",
      completedById: admin.id,
      completedByName: admin.name,
    },
  });

  if (
    !(await db.inventoryAdjustment.findUnique({
      where: { requestKey: "demo-inventory-restock-001" },
    }))
  ) {
    await db.inventoryAdjustment.create({
      data: {
        requestKey: "demo-inventory-restock-001",
        productId: chiliPowder.id,
        actorId: admin.id,
        actorName: admin.name,
        delta: 20,
        previousStock: 100,
        newStock: 120,
        expectedUpdatedAt: chiliPowder.updatedAt,
        reason: "Demo receiving adjustment",
        createdAt: ago(5),
      },
    });
  }

  if (!(await db.accountStatusEvent.findUnique({ where: { id: "demo-account-status-audit" } }))) {
    await db.accountStatusEvent.create({
      data: {
        id: "demo-account-status-audit",
        userId: otherCustomer.id,
        actorId: admin.id,
        actorName: admin.name,
        previousActive: false,
        active: true,
        createdAt: ago(6),
      },
    });
  }
  if (
    !(await db.accountStatusEvent.findUnique({ where: { id: "demo-inactive-customer-status" } }))
  ) {
    await db.accountStatusEvent.create({
      data: {
        id: "demo-inactive-customer-status",
        userId: inactiveCustomer.id,
        actorId: admin.id,
        actorName: admin.name,
        previousActive: true,
        active: false,
        createdAt: ago(3),
      },
    });
  }
  if (!(await db.accountStatusEvent.findUnique({ where: { id: "demo-inactive-rider-status" } }))) {
    await db.accountStatusEvent.create({
      data: {
        id: "demo-inactive-rider-status",
        riderId: inactiveRider.id,
        actorId: admin.id,
        actorName: admin.name,
        previousActive: true,
        active: false,
        createdAt: ago(3),
      },
    });
  }

  const demoCareerJob = await db.careerJob.upsert({
    where: { slug: "customer-experience-associate-demo" },
    update: {
      status: CareerJobStatuses.Published,
      title: "Customer Experience Associate (Demo)",
    },
    create: {
      slug: "customer-experience-associate-demo",
      title: "Customer Experience Associate (Demo)",
      department: "Customer Experience",
      location: "Dhaka, Bangladesh",
      employmentType: CareerEmploymentTypes.FullTime,
      workplaceMode: CareerWorkplaceModes.Hybrid,
      summary: "Help customers shop with confidence and make every support interaction useful.",
      description:
        "Work with customers and store teams to resolve order, payment and delivery questions. Help us improve support processes by sharing recurring customer feedback.",
      requirements: [
        "Clear written and verbal communication",
        "Patient, customer-focused problem solving",
        "Comfortable working with online tools and shared processes",
      ],
      status: CareerJobStatuses.Published,
      publishedAt: ago(7),
      createdById: admin.id,
      createdByName: admin.name ?? admin.email ?? "Store admin",
      createdAt: ago(7),
    },
  });
  await db.careerApplication.upsert({
    where: {
      jobId_email: { jobId: demoCareerJob.id, email: "candidate@store.local" },
    },
    update: {
      status: CareerApplicationStatuses.New,
      coverLetter:
        "I enjoy helping customers solve practical problems and would like to contribute to a reliable online shopping experience.",
    },
    create: {
      jobId: demoCareerJob.id,
      name: "Demo Candidate",
      email: "candidate@store.local",
      phone: "+8801712340099",
      resumeUrl: "https://example.com/demo-candidate-resume",
      coverLetter:
        "I enjoy helping customers solve practical problems and would like to contribute to a reliable online shopping experience.",
      status: CareerApplicationStatuses.New,
      createdAt: ago(1),
    },
  });
}
