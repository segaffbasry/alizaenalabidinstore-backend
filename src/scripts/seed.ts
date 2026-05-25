import {
  ExecArgs,
  IProductModuleService,
  IRegionModuleService,
  IStoreModuleService,
  ISalesChannelModuleService,
  IPaymentModuleService,
} from "@medusajs/framework/types";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";

export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const regionModule = container.resolve<IRegionModuleService>(Modules.REGION);
  const storeModule = container.resolve<IStoreModuleService>(Modules.STORE);
  const salesChannelModule = container.resolve<ISalesChannelModuleService>(
    Modules.SALES_CHANNEL
  );
  const paymentModule = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  );

  logger.info("Seeding store and region...");

  // Create store
  const [store] = await storeModule.listStores();
  let salesChannelId: string;

  if (store) {
    const channels = await salesChannelModule.listSalesChannels({
      name: "Default Sales Channel",
    });
    salesChannelId = channels[0]?.id;
  }

  if (!salesChannelId!) {
    const channel = await salesChannelModule.createSalesChannels({
      name: "Default Sales Channel",
      is_disabled: false,
    });
    salesChannelId = channel.id;
    logger.info(`Created sales channel: ${salesChannelId}`);
  }

  // Create IDR region
  const existingRegions = await regionModule.listRegions({ name: "Indonesia" });
  let regionId: string;

  if (existingRegions.length > 0) {
    regionId = existingRegions[0].id;
    logger.info(`Using existing region: ${regionId}`);
  } else {
    const region = await regionModule.createRegions({
      name: "Indonesia",
      currency_code: "idr",
      countries: ["id"],
      payment_providers: ["midtrans"],
    });
    regionId = region.id;
    logger.info(`Created region: ${regionId}`);
  }

  logger.info("Seeding products...");

  // Pre-create product types to avoid duplicate errors
  const productModule = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const existingTypes = await productModule.listProductTypes({});
  const typeMap: Record<string, string> = {};
  for (const t of existingTypes) {
    typeMap[t.value] = t.id;
  }
  for (const typeValue of ["book", "workshop", "service"]) {
    if (!typeMap[typeValue]) {
      const created = await productModule.createProductTypes({ value: typeValue });
      typeMap[typeValue] = (created as any).id ?? (Array.isArray(created) ? (created[0] as any).id : "");
    }
  }

  const products = [
    // ── Books ──────────────────────────────────────────────────────────────
    {
      title: "Uncover Your Unique Purpose",
      handle: "uncover-your-unique-purpose",
      subtitle: "Temukan Tujuan Hidupmu yang Sesungguhnya",
      description:
        "Buku transformatif karya Ali Zaenal Abidin yang memandu Anda menemukan tujuan hidup yang autentik. Melalui latihan praktis dan wawasan mendalam, buku ini membantu Anda keluar dari kebingungan dan menemukan arah yang benar-benar bermakna.",
      status: "published",
      type_id: typeMap["book"],
      images: [
        {
          url: "https://placehold.co/400x600/C8A96E/1A1A1A?text=Uncover+Your+Unique+Purpose",
        },
      ],
      options: [
        {
          title: "Format",
          values: ["Buku Fisik", "E-Book"],
        },
      ],
      variants: [
        {
          title: "Buku Fisik",
          sku: "UYUP-PHYSICAL",
          options: { Format: "Buku Fisik" },
          prices: [
            {
              amount: 15000000, // Rp 150.000 (in smallest unit, IDR has no subunit but Medusa uses * 100)
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 100,
        },
        {
          title: "E-Book",
          sku: "UYUP-EBOOK",
          options: { Format: "E-Book" },
          prices: [
            {
              amount: 7900000, // Rp 79.000
              currency_code: "idr",
            },
          ],
          manage_inventory: false,
        },
      ],
      sales_channels: [{ id: salesChannelId }],
    },
    {
      title: "Hidup Mau Ngapain?",
      handle: "hidup-mau-ngapain",
      subtitle: "Panduan Praktis Merancang Hidup Bermakna",
      description:
        "Buku bestseller Ali Zaenal Abidin yang menjawab pertanyaan paling fundamental: apa sebenarnya yang ingin kamu lakukan dengan hidupmu? Dengan bahasa yang ringan namun mengena, buku ini mengajak Anda merefleksikan nilai, impian, dan langkah nyata menuju kehidupan yang Anda inginkan.",
      status: "published",
      type_id: typeMap["book"],
      images: [
        {
          url: "https://placehold.co/400x600/1A1A1A/C8A96E?text=Hidup+Mau+Ngapain",
        },
      ],
      options: [
        {
          title: "Format",
          values: ["Buku Fisik", "E-Book"],
        },
      ],
      variants: [
        {
          title: "Buku Fisik",
          sku: "HMN-PHYSICAL",
          options: { Format: "Buku Fisik" },
          prices: [
            {
              amount: 13900000, // Rp 139.000
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 150,
        },
        {
          title: "E-Book",
          sku: "HMN-EBOOK",
          options: { Format: "E-Book" },
          prices: [
            {
              amount: 6900000, // Rp 69.000
              currency_code: "idr",
            },
          ],
          manage_inventory: false,
        },
      ],
      sales_channels: [{ id: salesChannelId }],
    },

    // ── Workshops ──────────────────────────────────────────────────────────
    {
      title: "Revisi Hidup Workshop",
      handle: "revisi-hidup-workshop",
      subtitle: "4-Day Intensive Life Redesign Experience",
      description:
        "Workshop intensif 4 hari bersama Ali Zaenal Abidin untuk me-redesign total hidup Anda. Melalui sesi deep-dive, journaling, dan peer group coaching, Anda akan keluar dengan clarity penuh tentang arah hidup, nilai inti, dan rencana aksi yang konkret.",
      status: "published",
      type_id: typeMap["workshop"],
      images: [
        {
          url: "https://placehold.co/800x500/F5F0E8/1A1A1A?text=Revisi+Hidup+Workshop",
        },
      ],
      options: [
        {
          title: "Batch",
          values: ["9-12 April 2026", "7-10 Juli 2026", "6-9 Oktober 2026"],
        },
      ],
      variants: [
        {
          title: "9-12 April 2026",
          sku: "RH-APR2026",
          options: { Batch: "9-12 April 2026" },
          prices: [
            {
              amount: 350000000, // Rp 3.500.000
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 30,
        },
        {
          title: "7-10 Juli 2026",
          sku: "RH-JUL2026",
          options: { Batch: "7-10 Juli 2026" },
          prices: [
            {
              amount: 350000000,
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 30,
        },
        {
          title: "6-9 Oktober 2026",
          sku: "RH-OCT2026",
          options: { Batch: "6-9 Oktober 2026" },
          prices: [
            {
              amount: 350000000,
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 30,
        },
      ],
      sales_channels: [{ id: salesChannelId }],
    },
    {
      title: "Mindful Manifestation Workshop",
      handle: "mindful-manifestation-workshop",
      subtitle: "3-Day Manifestation & Mindfulness Retreat",
      description:
        "Workshop 3 hari yang menggabungkan praktik mindfulness dengan teknik manifestasi yang terbukti efektif. Pelajari cara menyelaraskan pikiran, emosi, dan tindakan untuk mewujudkan kehidupan yang Anda impikan — dengan pendekatan yang sadar dan autentik.",
      status: "published",
      type_id: typeMap["workshop"],
      images: [
        {
          url: "https://placehold.co/800x500/EEF2EC/1A1A1A?text=Mindful+Manifestation",
        },
      ],
      options: [
        {
          title: "Batch",
          values: ["1-3 Mei 2026", "14-16 Agustus 2026"],
        },
      ],
      variants: [
        {
          title: "1-3 Mei 2026",
          sku: "MM-MAY2026",
          options: { Batch: "1-3 Mei 2026" },
          prices: [
            {
              amount: 275000000, // Rp 2.750.000
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 25,
        },
        {
          title: "14-16 Agustus 2026",
          sku: "MM-AUG2026",
          options: { Batch: "14-16 Agustus 2026" },
          prices: [
            {
              amount: 275000000,
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 25,
        },
      ],
      sales_channels: [{ id: salesChannelId }],
    },

    // ── 1-on-1 Session ─────────────────────────────────────────────────────
    {
      title: "1-on-1 Coaching Session with Ali",
      handle: "1on1-coaching-session",
      subtitle: "Sesi Coaching Pribadi Bersama Ali Zaenal Abidin",
      description:
        "Sesi coaching pribadi eksklusif bersama Ali Zaenal Abidin selama 60 menit via Zoom. Dapatkan panduan langsung, clarity, dan action plan yang dipersonalisasi sesuai situasi dan tujuan hidup Anda. Kuota sangat terbatas.",
      status: "published",
      type_id: typeMap["service"],
      images: [
        {
          url: "https://placehold.co/800x500/C8A96E/1A1A1A?text=1on1+Coaching+with+Ali",
        },
      ],
      options: [
        {
          title: "Durasi",
          values: ["60 Menit"],
        },
      ],
      variants: [
        {
          title: "60 Menit via Zoom",
          sku: "COACHING-60MIN",
          options: { Durasi: "60 Menit" },
          prices: [
            {
              amount: 150000000, // Rp 1.500.000
              currency_code: "idr",
            },
          ],
          manage_inventory: true,
          inventory_quantity: 8,
        },
      ],
      sales_channels: [{ id: salesChannelId }],
    },
  ];

  // Check existing products to avoid duplicates
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });
  const existingHandles = new Set(existingProducts.map((p: any) => p.handle));

  for (const product of products) {
    if (existingHandles.has(product.handle)) {
      logger.info(`Skipping existing product: ${product.title}`);
      continue;
    }

    await createProductsWorkflow(container).run({
      input: { products: [product as any] },
    });
    logger.info(`Created product: ${product.title}`);
  }

  logger.info("Seed completed successfully!");
}
