import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

const Cart = ({
  cartItems,
  onUpdateQty,
  onDeleteItem,
  totalAmount,
  onClose,
  onCheckoutSuccess,
}) => {
  const { csrfToken } = useAuth();
  const paypalButtonsRef = useRef(null);
  const paypalRenderedRef = useRef(false);

  const [checkout, setCheckout] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizedItems = useMemo(
    () =>
      cartItems
        .map((it) => ({ pid: it.pid, qty: it.qty }))
        .filter((it) => Number.isInteger(it.pid) && Number.isInteger(it.qty)),
    [cartItems],
  );

  const loadPayPalSdk = async (clientId, currency) => {
    if (window.paypal) return;
    await new Promise((resolve, reject) => {
      const existing = document.getElementById("paypal-sdk");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "paypal-sdk";
      script.async = true;
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
        clientId,
      )}&currency=${encodeURIComponent(currency)}&intent=capture`;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  useEffect(() => {
    paypalRenderedRef.current = false;
    if (paypalButtonsRef.current) {
      paypalButtonsRef.current.innerHTML = "";
    }
  }, [checkout?.orderId]);

  useEffect(() => {
    const renderButtons = async () => {
      if (!checkout?.orderId || !checkout?.digest) return;
      if (!paypalButtonsRef.current) return;
      if (paypalRenderedRef.current) return;
      if (!window.paypal?.Buttons) return;

      paypalRenderedRef.current = true;

      window.paypal
        .Buttons({
          createOrder: async () => {
            const res = await fetch("/api/paypal/create-order", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": csrfToken,
              },
              credentials: "include",
              body: JSON.stringify({
                orderId: checkout.orderId,
                digest: checkout.digest,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Create order failed");
            return data.paypalOrderId;
          },
          onApprove: async (data) => {
            const res = await fetch("/api/paypal/capture-order", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": csrfToken,
              },
              credentials: "include",
              body: JSON.stringify({
                orderId: checkout.orderId,
                digest: checkout.digest,
                paypalOrderId: data.orderID,
              }),
            });
            const out = await res.json();
            if (!res.ok) throw new Error(out.error || "Capture failed");
            setCheckout(null);
            onCheckoutSuccess?.();
          },
          onCancel: () => {
            setError("Payment cancelled");
            setCheckout(null);
          },
          onError: (err) => {
            setError(err?.message || "PayPal error");
            setCheckout(null);
          },
        })
        .render(paypalButtonsRef.current);
    };

    renderButtons().catch(() => {
      setError("Failed to render PayPal buttons");
    });
  }, [checkout?.orderId, checkout?.digest, csrfToken, onCheckoutSuccess]);

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (cartItems.length === 0) return;

    setLoading(true);
    try {
      const clientRes = await fetch("/api/paypal/client-id", {
        credentials: "include",
      });
      const clientData = await clientRes.json();
      if (!clientRes.ok || !clientData?.clientId) {
        throw new Error("PayPal client not configured");
      }

      const res = await fetch("/api/checkout/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ items: normalizedItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      await loadPayPalSdk(clientData.clientId, data.currency || "USD");
      setCheckout({ orderId: data.orderId, digest: data.digest });
    } catch (err) {
      setError(err?.message || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="shopping-cart">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h3 style={{ margin: 0, border: "none", padding: 0 }}>Shopping List</h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            color: "#64748b",
          }}
        >
          ×
        </button>
      </div>

      {cartItems.length === 0 ? (
        <p>No items yet.</p>
      ) : (
        <>
          <form onSubmit={handleCheckoutSubmit}>
            <ul>
              {cartItems.map((item) => (
                <li key={item.pid} className="cart-item">
                  <div className="cart-item-info">
                    <span>{item.name}</span>
                    <span>${item.price}</span>
                  </div>

                  <div className="cart-item-controls">
                    <input
                      type="number"
                      min="0"
                      value={item.qty}
                      disabled={!!checkout}
                      onChange={(e) => onUpdateQty(item.pid, e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!!checkout}
                      onClick={() => onDeleteItem(item.pid)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <p className="cart-total">Total: ${totalAmount.toFixed(2)}</p>

            {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

            {!checkout ? (
              <button className="checkout-btn" type="submit" disabled={loading}>
                {loading ? "Preparing..." : "Checkout"}
              </button>
            ) : (
              <div ref={paypalButtonsRef} />
            )}
          </form>
        </>
      )}
    </aside>
  );
};

export default Cart;
