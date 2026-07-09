import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "hobbyfi-dev-jwt-secret-change-in-production";

const vendorId = process.argv[2] || "vendor-a-0001-0000-0000-000000000001";
const vendorName = process.argv[3] || "Rahul Sharma";

const token = jwt.sign({ vendorId, vendorName }, JWT_SECRET, { expiresIn: "24h" });

console.log("\nGenerated JWT Token:");
console.log(token);
console.log("\nFor vendor:", vendorName, `(${vendorId})`);
console.log("\nCopy this token and paste it in the frontend login screen.\n");
