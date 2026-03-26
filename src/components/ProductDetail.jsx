const ProductDetail = ({ product, onAddToCart }) => {
  return (
    <section className="product-detail">
      <img src={product.image} alt={product.name} />
      <h2>{product.name}</h2>
      <p>{product.description}</p>
      <p className="price">${product.price}</p>
      <button onClick={() => onAddToCart(product)}>
        Add to Cart
      </button>
    </section>
  );
};

export default ProductDetail;
