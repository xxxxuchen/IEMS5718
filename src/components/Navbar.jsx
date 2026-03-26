import { useAuth } from "../context/AuthContext";

const Navbar = ({
  categories,
  setSelectedCatid,
  setPage,
  onOpenCart,
  cartCount,
}) => {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="site-header">
        <div className="header-container">
          <h1>IEMS5718 Project</h1>
          <div className="user-info">
            {user ? (
              <>
                <span>
                  Hello, {user.email} {user.isAdmin ? "(Admin)" : ""}
                </span>
                {user.isAdmin && (
                  <a href="/admin/" target="_blank">
                    Admin Panel
                  </a>
                )}
                <button onClick={logout}>Logout</button>
              </>
            ) : (
              <>
                <span>Hello, guest</span>
                <button onClick={() => setPage("login")}>Login</button>
              </>
            )}
          </div>
        </div>
      </header>

      <nav className="main-nav">
        <ul>
          <li>
            <a onClick={() => setPage("home")}>Home</a>
          </li>

          {categories.map((cat) => (
            <li key={cat.catid}>
              <a
                onClick={() => {
                  setSelectedCatid(cat.catid);
                  setPage("home");
                }}
              >
                {cat.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="cart-toggle">
        <button onClick={onOpenCart}>Shopping List ({cartCount})</button>
      </div>
    </>
  );
};

export default Navbar;
