"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seed;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
async function seed({ container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const regionModule = container.resolve(utils_1.Modules.REGION);
    const storeModule = container.resolve(utils_1.Modules.STORE);
    const salesChannelModule = container.resolve(utils_1.Modules.SALES_CHANNEL);
    const paymentModule = container.resolve(utils_1.Modules.PAYMENT);
    logger.info("Seeding store and region...");
    // Create store
    const [store] = await storeModule.listStores();
    let salesChannelId;
    if (store) {
        const channels = await salesChannelModule.listSalesChannels({
            name: "Default Sales Channel",
        });
        salesChannelId = channels[0]?.id;
    }
    if (!salesChannelId) {
        const channel = await salesChannelModule.createSalesChannels({
            name: "Default Sales Channel",
            is_disabled: false,
        });
        salesChannelId = channel.id;
        logger.info(`Created sales channel: ${salesChannelId}`);
    }
    // Create IDR region
    const existingRegions = await regionModule.listRegions({ name: "Indonesia" });
    let regionId;
    if (existingRegions.length > 0) {
        regionId = existingRegions[0].id;
        logger.info(`Using existing region: ${regionId}`);
    }
    else {
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
    const productModule = container.resolve(utils_1.Modules.PRODUCT);
    const existingTypes = await productModule.listProductTypes({});
    const typeMap = {};
    for (const t of existingTypes) {
        typeMap[t.value] = t.id;
    }
    for (const typeValue of ["book", "workshop", "service"]) {
        if (!typeMap[typeValue]) {
            const created = await productModule.createProductTypes({ value: typeValue });
            typeMap[typeValue] = created.id ?? (Array.isArray(created) ? created[0].id : "");
        }
    }
    const products = [
        // ── Books ──────────────────────────────────────────────────────────────
        {
            title: "Uncover Your Unique Purpose",
            handle: "uncover-your-unique-purpose",
            subtitle: "Temukan Tujuan Hidupmu yang Sesungguhnya",
            description: "Buku transformatif karya Ali Zaenal Abidin yang memandu Anda menemukan tujuan hidup yang autentik. Melalui latihan praktis dan wawasan mendalam, buku ini membantu Anda keluar dari kebingungan dan menemukan arah yang benar-benar bermakna.",
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
            description: "Buku bestseller Ali Zaenal Abidin yang menjawab pertanyaan paling fundamental: apa sebenarnya yang ingin kamu lakukan dengan hidupmu? Dengan bahasa yang ringan namun mengena, buku ini mengajak Anda merefleksikan nilai, impian, dan langkah nyata menuju kehidupan yang Anda inginkan.",
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
            description: "Workshop intensif 4 hari bersama Ali Zaenal Abidin untuk me-redesign total hidup Anda. Melalui sesi deep-dive, journaling, dan peer group coaching, Anda akan keluar dengan clarity penuh tentang arah hidup, nilai inti, dan rencana aksi yang konkret.",
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
            description: "Workshop 3 hari yang menggabungkan praktik mindfulness dengan teknik manifestasi yang terbukti efektif. Pelajari cara menyelaraskan pikiran, emosi, dan tindakan untuk mewujudkan kehidupan yang Anda impikan — dengan pendekatan yang sadar dan autentik.",
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
            description: "Sesi coaching pribadi eksklusif bersama Ali Zaenal Abidin selama 60 menit via Zoom. Dapatkan panduan langsung, clarity, dan action plan yang dipersonalisasi sesuai situasi dan tujuan hidup Anda. Kuota sangat terbatas.",
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
    const existingHandles = new Set(existingProducts.map((p) => p.handle));
    for (const product of products) {
        if (existingHandles.has(product.handle)) {
            logger.info(`Skipping existing product: ${product.title}`);
            continue;
        }
        await (0, core_flows_1.createProductsWorkflow)(container).run({
            input: { products: [product] },
        });
        logger.info(`Created product: ${product.title}`);
    }
    logger.info("Seed completed successfully!");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY3JpcHRzL3NlZWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFXQSx1QkFvVkM7QUF2VkQscURBQStFO0FBQy9FLDREQUFxRTtBQUV0RCxLQUFLLFVBQVUsSUFBSSxDQUFDLEVBQUUsU0FBUyxFQUFZO0lBQ3hELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUVqRSxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsT0FBTyxDQUF1QixlQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0UsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBc0IsZUFBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFFLE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FDMUMsZUFBTyxDQUFDLGFBQWEsQ0FDdEIsQ0FBQztJQUNGLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQ3JDLGVBQU8sQ0FBQyxPQUFPLENBQ2hCLENBQUM7SUFFRixNQUFNLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUM7SUFFM0MsZUFBZTtJQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUMvQyxJQUFJLGNBQXNCLENBQUM7SUFFM0IsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNWLE1BQU0sUUFBUSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsaUJBQWlCLENBQUM7WUFDMUQsSUFBSSxFQUFFLHVCQUF1QjtTQUM5QixDQUFDLENBQUM7UUFDSCxjQUFjLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQsSUFBSSxDQUFDLGNBQWUsRUFBRSxDQUFDO1FBQ3JCLE1BQU0sT0FBTyxHQUFHLE1BQU0sa0JBQWtCLENBQUMsbUJBQW1CLENBQUM7WUFDM0QsSUFBSSxFQUFFLHVCQUF1QjtZQUM3QixXQUFXLEVBQUUsS0FBSztTQUNuQixDQUFDLENBQUM7UUFDSCxjQUFjLEdBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUM1QixNQUFNLENBQUMsSUFBSSxDQUFDLDBCQUEwQixjQUFjLEVBQUUsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFRCxvQkFBb0I7SUFDcEIsTUFBTSxlQUFlLEdBQUcsTUFBTSxZQUFZLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDOUUsSUFBSSxRQUFnQixDQUFDO0lBRXJCLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMvQixRQUFRLEdBQUcsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNqQyxNQUFNLENBQUMsSUFBSSxDQUFDLDBCQUEwQixRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7U0FBTSxDQUFDO1FBQ04sTUFBTSxNQUFNLEdBQUcsTUFBTSxZQUFZLENBQUMsYUFBYSxDQUFDO1lBQzlDLElBQUksRUFBRSxXQUFXO1lBQ2pCLGFBQWEsRUFBRSxLQUFLO1lBQ3BCLFNBQVMsRUFBRSxDQUFDLElBQUksQ0FBQztZQUNqQixpQkFBaUIsRUFBRSxDQUFDLFVBQVUsQ0FBQztTQUNoQyxDQUFDLENBQUM7UUFDSCxRQUFRLEdBQUcsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUNyQixNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFFbkMscURBQXFEO0lBQ3JELE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQXdCLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoRixNQUFNLGFBQWEsR0FBRyxNQUFNLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMvRCxNQUFNLE9BQU8sR0FBMkIsRUFBRSxDQUFDO0lBQzNDLEtBQUssTUFBTSxDQUFDLElBQUksYUFBYSxFQUFFLENBQUM7UUFDOUIsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFDRCxLQUFLLE1BQU0sU0FBUyxJQUFJLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3hELElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUN4QixNQUFNLE9BQU8sR0FBRyxNQUFNLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQzdFLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBSSxPQUFlLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUUsT0FBTyxDQUFDLENBQUMsQ0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDckcsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRztRQUNmLDBFQUEwRTtRQUMxRTtZQUNFLEtBQUssRUFBRSw2QkFBNkI7WUFDcEMsTUFBTSxFQUFFLDZCQUE2QjtZQUNyQyxRQUFRLEVBQUUsMENBQTBDO1lBQ3BELFdBQVcsRUFDVCwrT0FBK087WUFDalAsTUFBTSxFQUFFLFdBQVc7WUFDbkIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUM7WUFDeEIsTUFBTSxFQUFFO2dCQUNOO29CQUNFLEdBQUcsRUFBRSw2RUFBNkU7aUJBQ25GO2FBQ0Y7WUFDRCxPQUFPLEVBQUU7Z0JBQ1A7b0JBQ0UsS0FBSyxFQUFFLFFBQVE7b0JBQ2YsTUFBTSxFQUFFLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQztpQkFDakM7YUFDRjtZQUNELFFBQVEsRUFBRTtnQkFDUjtvQkFDRSxLQUFLLEVBQUUsWUFBWTtvQkFDbkIsR0FBRyxFQUFFLGVBQWU7b0JBQ3BCLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUU7b0JBQ2pDLE1BQU0sRUFBRTt3QkFDTjs0QkFDRSxNQUFNLEVBQUUsUUFBUSxFQUFFLDBFQUEwRTs0QkFDNUYsYUFBYSxFQUFFLEtBQUs7eUJBQ3JCO3FCQUNGO29CQUNELGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLGtCQUFrQixFQUFFLEdBQUc7aUJBQ3hCO2dCQUNEO29CQUNFLEtBQUssRUFBRSxRQUFRO29CQUNmLEdBQUcsRUFBRSxZQUFZO29CQUNqQixPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO29CQUM3QixNQUFNLEVBQUU7d0JBQ047NEJBQ0UsTUFBTSxFQUFFLE9BQU8sRUFBRSxZQUFZOzRCQUM3QixhQUFhLEVBQUUsS0FBSzt5QkFDckI7cUJBQ0Y7b0JBQ0QsZ0JBQWdCLEVBQUUsS0FBSztpQkFDeEI7YUFDRjtZQUNELGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDO1NBQ3pDO1FBQ0Q7WUFDRSxLQUFLLEVBQUUsb0JBQW9CO1lBQzNCLE1BQU0sRUFBRSxtQkFBbUI7WUFDM0IsUUFBUSxFQUFFLDBDQUEwQztZQUNwRCxXQUFXLEVBQ1QsMlJBQTJSO1lBQzdSLE1BQU0sRUFBRSxXQUFXO1lBQ25CLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDO1lBQ3hCLE1BQU0sRUFBRTtnQkFDTjtvQkFDRSxHQUFHLEVBQUUsbUVBQW1FO2lCQUN6RTthQUNGO1lBQ0QsT0FBTyxFQUFFO2dCQUNQO29CQUNFLEtBQUssRUFBRSxRQUFRO29CQUNmLE1BQU0sRUFBRSxDQUFDLFlBQVksRUFBRSxRQUFRLENBQUM7aUJBQ2pDO2FBQ0Y7WUFDRCxRQUFRLEVBQUU7Z0JBQ1I7b0JBQ0UsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLEdBQUcsRUFBRSxjQUFjO29CQUNuQixPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFO29CQUNqQyxNQUFNLEVBQUU7d0JBQ047NEJBQ0UsTUFBTSxFQUFFLFFBQVEsRUFBRSxhQUFhOzRCQUMvQixhQUFhLEVBQUUsS0FBSzt5QkFDckI7cUJBQ0Y7b0JBQ0QsZ0JBQWdCLEVBQUUsSUFBSTtvQkFDdEIsa0JBQWtCLEVBQUUsR0FBRztpQkFDeEI7Z0JBQ0Q7b0JBQ0UsS0FBSyxFQUFFLFFBQVE7b0JBQ2YsR0FBRyxFQUFFLFdBQVc7b0JBQ2hCLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUU7b0JBQzdCLE1BQU0sRUFBRTt3QkFDTjs0QkFDRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFlBQVk7NEJBQzdCLGFBQWEsRUFBRSxLQUFLO3lCQUNyQjtxQkFDRjtvQkFDRCxnQkFBZ0IsRUFBRSxLQUFLO2lCQUN4QjthQUNGO1lBQ0QsY0FBYyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUM7U0FDekM7UUFFRCwwRUFBMEU7UUFDMUU7WUFDRSxLQUFLLEVBQUUsdUJBQXVCO1lBQzlCLE1BQU0sRUFBRSx1QkFBdUI7WUFDL0IsUUFBUSxFQUFFLDBDQUEwQztZQUNwRCxXQUFXLEVBQ1QsMFBBQTBQO1lBQzVQLE1BQU0sRUFBRSxXQUFXO1lBQ25CLE9BQU8sRUFBRSxPQUFPLENBQUMsVUFBVSxDQUFDO1lBQzVCLE1BQU0sRUFBRTtnQkFDTjtvQkFDRSxHQUFHLEVBQUUsdUVBQXVFO2lCQUM3RTthQUNGO1lBQ0QsT0FBTyxFQUFFO2dCQUNQO29CQUNFLEtBQUssRUFBRSxPQUFPO29CQUNkLE1BQU0sRUFBRSxDQUFDLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixDQUFDO2lCQUNsRTthQUNGO1lBQ0QsUUFBUSxFQUFFO2dCQUNSO29CQUNFLEtBQUssRUFBRSxpQkFBaUI7b0JBQ3hCLEdBQUcsRUFBRSxZQUFZO29CQUNqQixPQUFPLEVBQUUsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7b0JBQ3JDLE1BQU0sRUFBRTt3QkFDTjs0QkFDRSxNQUFNLEVBQUUsU0FBUyxFQUFFLGVBQWU7NEJBQ2xDLGFBQWEsRUFBRSxLQUFLO3lCQUNyQjtxQkFDRjtvQkFDRCxnQkFBZ0IsRUFBRSxJQUFJO29CQUN0QixrQkFBa0IsRUFBRSxFQUFFO2lCQUN2QjtnQkFDRDtvQkFDRSxLQUFLLEVBQUUsZ0JBQWdCO29CQUN2QixHQUFHLEVBQUUsWUFBWTtvQkFDakIsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFO29CQUNwQyxNQUFNLEVBQUU7d0JBQ047NEJBQ0UsTUFBTSxFQUFFLFNBQVM7NEJBQ2pCLGFBQWEsRUFBRSxLQUFLO3lCQUNyQjtxQkFDRjtvQkFDRCxnQkFBZ0IsRUFBRSxJQUFJO29CQUN0QixrQkFBa0IsRUFBRSxFQUFFO2lCQUN2QjtnQkFDRDtvQkFDRSxLQUFLLEVBQUUsa0JBQWtCO29CQUN6QixHQUFHLEVBQUUsWUFBWTtvQkFDakIsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFO29CQUN0QyxNQUFNLEVBQUU7d0JBQ047NEJBQ0UsTUFBTSxFQUFFLFNBQVM7NEJBQ2pCLGFBQWEsRUFBRSxLQUFLO3lCQUNyQjtxQkFDRjtvQkFDRCxnQkFBZ0IsRUFBRSxJQUFJO29CQUN0QixrQkFBa0IsRUFBRSxFQUFFO2lCQUN2QjthQUNGO1lBQ0QsY0FBYyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUM7U0FDekM7UUFDRDtZQUNFLEtBQUssRUFBRSxnQ0FBZ0M7WUFDdkMsTUFBTSxFQUFFLGdDQUFnQztZQUN4QyxRQUFRLEVBQUUsMkNBQTJDO1lBQ3JELFdBQVcsRUFDVCw0UEFBNFA7WUFDOVAsTUFBTSxFQUFFLFdBQVc7WUFDbkIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxVQUFVLENBQUM7WUFDNUIsTUFBTSxFQUFFO2dCQUNOO29CQUNFLEdBQUcsRUFBRSx1RUFBdUU7aUJBQzdFO2FBQ0Y7WUFDRCxPQUFPLEVBQUU7Z0JBQ1A7b0JBQ0UsS0FBSyxFQUFFLE9BQU87b0JBQ2QsTUFBTSxFQUFFLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDO2lCQUMvQzthQUNGO1lBQ0QsUUFBUSxFQUFFO2dCQUNSO29CQUNFLEtBQUssRUFBRSxjQUFjO29CQUNyQixHQUFHLEVBQUUsWUFBWTtvQkFDakIsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRTtvQkFDbEMsTUFBTSxFQUFFO3dCQUNOOzRCQUNFLE1BQU0sRUFBRSxTQUFTLEVBQUUsZUFBZTs0QkFDbEMsYUFBYSxFQUFFLEtBQUs7eUJBQ3JCO3FCQUNGO29CQUNELGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLGtCQUFrQixFQUFFLEVBQUU7aUJBQ3ZCO2dCQUNEO29CQUNFLEtBQUssRUFBRSxvQkFBb0I7b0JBQzNCLEdBQUcsRUFBRSxZQUFZO29CQUNqQixPQUFPLEVBQUUsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUU7b0JBQ3hDLE1BQU0sRUFBRTt3QkFDTjs0QkFDRSxNQUFNLEVBQUUsU0FBUzs0QkFDakIsYUFBYSxFQUFFLEtBQUs7eUJBQ3JCO3FCQUNGO29CQUNELGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLGtCQUFrQixFQUFFLEVBQUU7aUJBQ3ZCO2FBQ0Y7WUFDRCxjQUFjLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQztTQUN6QztRQUVELDBFQUEwRTtRQUMxRTtZQUNFLEtBQUssRUFBRSxrQ0FBa0M7WUFDekMsTUFBTSxFQUFFLHVCQUF1QjtZQUMvQixRQUFRLEVBQUUsaURBQWlEO1lBQzNELFdBQVcsRUFDVCwyTkFBMk47WUFDN04sTUFBTSxFQUFFLFdBQVc7WUFDbkIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUM7WUFDM0IsTUFBTSxFQUFFO2dCQUNOO29CQUNFLEdBQUcsRUFBRSx3RUFBd0U7aUJBQzlFO2FBQ0Y7WUFDRCxPQUFPLEVBQUU7Z0JBQ1A7b0JBQ0UsS0FBSyxFQUFFLFFBQVE7b0JBQ2YsTUFBTSxFQUFFLENBQUMsVUFBVSxDQUFDO2lCQUNyQjthQUNGO1lBQ0QsUUFBUSxFQUFFO2dCQUNSO29CQUNFLEtBQUssRUFBRSxtQkFBbUI7b0JBQzFCLEdBQUcsRUFBRSxnQkFBZ0I7b0JBQ3JCLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUU7b0JBQy9CLE1BQU0sRUFBRTt3QkFDTjs0QkFDRSxNQUFNLEVBQUUsU0FBUyxFQUFFLGVBQWU7NEJBQ2xDLGFBQWEsRUFBRSxLQUFLO3lCQUNyQjtxQkFDRjtvQkFDRCxnQkFBZ0IsRUFBRSxJQUFJO29CQUN0QixrQkFBa0IsRUFBRSxDQUFDO2lCQUN0QjthQUNGO1lBQ0QsY0FBYyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUM7U0FDekM7S0FDRixDQUFDO0lBRUYsOENBQThDO0lBQzlDLE1BQU0sRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDbkQsTUFBTSxFQUFFLFNBQVM7UUFDakIsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQztLQUN6QixDQUFDLENBQUM7SUFDSCxNQUFNLGVBQWUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBRTVFLEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7UUFDL0IsSUFBSSxlQUFlLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsOEJBQThCLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQzNELFNBQVM7UUFDWCxDQUFDO1FBRUQsTUFBTSxJQUFBLG1DQUFzQixFQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUMxQyxLQUFLLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxPQUFjLENBQUMsRUFBRTtTQUN0QyxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLG9CQUFvQixPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0FBQzlDLENBQUMifQ==