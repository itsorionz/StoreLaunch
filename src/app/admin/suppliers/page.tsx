import { listSuppliers } from "@backend/lib/admin-catalog-queries";

export default async function SuppliersPage() {
  const suppliers = await listSuppliers();

  return (
    <div className="min-h-screen bg-background">
      <h1 className="text-2xl font-medium p-4">Suppliers</h1>
      <div className="p-4">
        {suppliers.map((s) => (
          <div key={s.id} className="border p-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium">{s.name}</h3>
                <p className="text-sm text-muted">{s.email || "—"}</p>
                <p className="text-sm text-muted">{s.phone || "—"}</p>
                <p className="text-sm text-muted">{s.address || "—"}</p>
              </div>
              <div>
                <span className="badge badge-success">{s.active ? "Active" : "Inactive"}</span>
              </div>
            </div>
            <p className="text-sm mt-2">{s.note || "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
