const Cart = ({
  cartItems,
  onUpdateQty,
  onDeleteItem,
  totalAmount,
  onClose,
}) => {
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
                    onChange={(e) => onUpdateQty(item.pid, e.target.value)}
                  />
                  <button onClick={() => onDeleteItem(item.pid)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>

          <p className="cart-total">Total: ${totalAmount.toFixed(2)}</p>
        </>
      )}

      <button className="checkout-btn">Checkout</button>
    </aside>
  );
};

export default Cart;
