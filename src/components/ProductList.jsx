const ProductList = ({ products, onOpenProduct, onAddToCart }) => {
  return (
    <section className="product-list">
      {products.map((p) => (
        <div className="product-card" key={p.pid}>
          <img
            src={p.image_thumb || p.image}
            alt={p.name}
            onClick={() => onOpenProduct(p.pid)}
          />
          <h3 onClick={() => onOpenProduct(p.pid)}>{p.name}</h3>
          <p>${p.price}</p>
          <button onClick={() => onAddToCart(p)}>Add to Cart</button>
        </div>
      ))}
    </section>
  );
};

export default ProductList;
