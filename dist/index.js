"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield prisma.settings.findUnique({
            where: {
                id: "bw_filter_list"
            }
        });
        if (!res) {
            console.log('settings not found, filling default details');
            const settingsData = {
                domains: [
                    'x.com/',
                    'facebook.com/',
                    'wikipedia.org/',
                ],
                keywords: [
                    'movies',
                    'water',
                ],
                lastUpdated: new Date().toISOString()
            };
            const res = yield prisma.settings.create({
                data: {
                    id: "bw_filter_list",
                    type: "BLACKLIST",
                    data: settingsData
                }
            });
            console.log('New settings created: ', res);
        }
        else {
            console.log("Old settings found: ", res);
        }
    });
}
app.listen(process.env.PORT, () => {
    console.log(`Server running on ${process.env.PORT}...`);
    main()
        .catch((e) => __awaiter(void 0, void 0, void 0, function* () {
        console.error("ERROR: ", e);
    }))
        .finally(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.$disconnect();
    }));
});
