import { useEffect, useState } from "react";
import "./App.css";
import { useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import ProductList from "./components/ProductList";
import ProductDetail from "./components/ProductDetail";
import Cart from "./components/Cart";
import Login from "./components/Login";
import Register from "./components/Register";

function App() {
  const { loading } = useAuth();
  const [page, setPage] = useState("home");
  const [categories, setCategories] = useState([]);
  const [selectedCatid, setSelectedCatid] = useState(null);
  const [products, setProducts] = useState([]);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  // ---------- Load categories ----------
  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        setCategories(data);
        if (data.length > 0 && !selectedCatid) {
          setSelectedCatid(data[0].catid);
        }
      })
      .catch((err) => console.error("Failed to load categories:", err));
  }, []);

  // ---------- Load products by category ----------
  useEffect(() => {
    if (!selectedCatid) return;

    fetch(`/api/products?catid=${selectedCatid}`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
      })
      .catch((err) => console.error("Failed to load products:", err));
  }, [selectedCatid]);

  // ---------- Restore cart from localStorage ----------
  useEffect(() => {
    const savedCart = JSON.parse(localStorage.getItem("cart")) || {};
    const pids = Object.keys(savedCart);
    if (pids.length === 0) return;

    Promise.all(
      pids.map((pid) =>
        fetch(`/api/products/${pid}`).then((res) => res.json()),
      ),
    )
      .then((productsFromServer) => {
        const restoredItems = productsFromServer.map((product) => ({
          pid: product.pid,
          name: product.name,
          price: product.price,
          image_thumb: product.image_thumb,
          qty: savedCart[product.pid],
        }));
        setCartItems(restoredItems);
      })
      .catch((err) => console.error("Failed to restore cart:", err));
  }, []);

  // ---------- Save cart to localStorage ----------
  useEffect(() => {
    const cartForStorage = {};
    cartItems.forEach((item) => {
      cartForStorage[item.pid] = item.qty;
    });
    localStorage.setItem("cart", JSON.stringify(cartForStorage));
  }, [cartItems]);

  const openProduct = (pid) => {
    fetch(`/api/products/${pid}`)
      .then((res) => res.json())
      .then((data) => {
        setCurrentProduct(data);
        setPage("product");
      })
      .catch((err) => console.error("Failed to load product detail:", err));
  };

  const addToCart = async (product) => {
    const existing = cartItems.find((item) => item.pid === product.pid);
    if (existing) {
      setCartItems(
        cartItems.map((item) =>
          item.pid === product.pid ? { ...item, qty: item.qty + 1 } : item,
        ),
      );
      return;
    }

    try {
      const res = await fetch(`/api/products/${product.pid}`);
      const fullProduct = await res.json();
      setCartItems([
        ...cartItems,
        {
          pid: fullProduct.pid,
          name: fullProduct.name,
          price: fullProduct.price,
          image_thumb: fullProduct.image_thumb,
          qty: 1,
        },
      ]);
    } catch (err) {
      console.error("Failed to add to cart:", err);
    }
  };

  const updateQty = (pid, newQty) => {
    const qtyNum = parseInt(newQty, 10);
    if (isNaN(qtyNum) || qtyNum < 0) return;
    if (qtyNum === 0) {
      setCartItems(cartItems.filter((item) => item.pid !== pid));
    } else {
      setCartItems(
        cartItems.map((item) =>
          item.pid === pid ? { ...item, qty: qtyNum } : item,
        ),
      );
    }
  };

  const deleteItem = (pid) => {
    setCartItems(cartItems.filter((item) => item.pid !== pid));
  };

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );

  if (loading) return <div>Loading...</div>;

  return (
    <>
      <Navbar
        categories={categories}
        setSelectedCatid={setSelectedCatid}
        setPage={setPage}
        onOpenCart={() => setCartOpen(!cartOpen)}
        cartCount={cartItems.length}
      />

      {cartOpen && (
        <Cart
          cartItems={cartItems}
          onUpdateQty={updateQty}
          onDeleteItem={deleteItem}
          totalAmount={totalAmount}
          onClose={() => setCartOpen(false)}
        />
      )}

      <nav className="breadcrumb">
        {page === "home" && <>Home</>}
        {page === "product" && currentProduct && (
          <>
            <a onClick={() => setPage("home")}>Home</a> &gt;{" "}
            {currentProduct.name}
          </>
        )}
        {page === "login" && <>Login</>}
        {page === "register" && <>Register</>}
      </nav>

      <main className="main-content">
        {page === "home" && (
          <ProductList
            products={products}
            onOpenProduct={openProduct}
            onAddToCart={addToCart}
          />
        )}

        {page === "product" && currentProduct && (
          <ProductDetail product={currentProduct} onAddToCart={addToCart} />
        )}

        {page === "login" && (
          <Login
            onSwitch={() => setPage("register")}
            onSuccess={() => setPage("home")}
          />
        )}

        {page === "register" && <Register onSwitch={() => setPage("login")} />}
      </main>

      <footer className="site-footer">
        <p>© IEMS5718 Project</p>
      </footer>
    </>
  );
}

export default App;
