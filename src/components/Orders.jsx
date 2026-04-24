import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const Orders = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError("");

    fetch("/api/orders/my", { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load orders");
        setOrders(data);
      })
      .catch((e) => setError(e.message || "Failed to load orders"))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) {
    return <p>Please login to view your orders.</p>;
  }

  if (loading) return <p>Loading orders...</p>;
  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (orders.length === 0) return <p>No orders yet.</p>;

  return (
    <div style={{ width: "100%" }}>
      <h2 style={{ marginTop: 0 }}>My Recent Orders</h2>
      {orders.map((o) => (
        <div
          key={o.order_id}
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            padding: "12px",
            marginBottom: "12px",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div>
                <strong>Order</strong> #{o.order_id}
              </div>
              <div>
                <strong>Status</strong> {o.status}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>
                <strong>Total</strong> {o.currency} {Number(o.total).toFixed(2)}
              </div>
              {o.paid_at && (
                <div>
                  <strong>Paid</strong> {o.paid_at}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: "10px" }}>
            <strong>Items</strong>
            <ul style={{ margin: "6px 0 0 18px" }}>
              {o.items.map((it) => (
                <li key={`${o.order_id}-${it.pid}`}>
                  {it.name} (#{it.pid}) × {it.qty} @ {o.currency}{" "}
                  {Number(it.price).toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Orders;

