let csrfToken = "";

async function fetchCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const data = await res.json();
  csrfToken = data.csrfToken;
}

async function loadCategories() {
  const res = await fetch("/api/categories");
  const categories = await res.json();

  const select = document.getElementById("catid");
  select.innerHTML = "";
  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat.catid;
    // Use textContent to prevent XSS
    option.textContent = cat.name + " (ID: " + cat.catid + ")";
    select.appendChild(option);
  });
}

document
  .getElementById("categoryForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("catName");
    const name = nameInput.value.trim();

    if (!name || name.length > 50) {
      alert("Invalid category name (max 50 chars)");
      return;
    }

    const res = await fetch("/api/categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    alert(JSON.stringify(data));
    if (res.ok) {
      nameInput.value = "";
      loadCategories();
    }
  });

document
  .getElementById("updateCategoryForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const catid = document.getElementById("updateCatId").value;
    const name = document.getElementById("updateCatName").value.trim();

    if (!name || name.length > 50) {
      alert("Invalid category name (max 50 chars)");
      return;
    }

    const res = await fetch("/api/categories/" + catid, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    alert(JSON.stringify(data));
    if (res.ok) loadCategories();
  });

document
  .getElementById("deleteCategoryForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const catid = document.getElementById("deleteCatId").value;

    const res = await fetch("/api/categories/" + catid, {
      method: "DELETE",
      headers: {
        "x-csrf-token": csrfToken,
      },
    });

    const data = await res.json();
    alert(JSON.stringify(data));
    if (res.ok) loadCategories();
  });

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData();
  const name = document.getElementById("name").value.trim();
  const price = document.getElementById("price").value;
  const description = document.getElementById("description").value.trim();

  if (
    !name ||
    name.length > 100 ||
    !price ||
    !description ||
    description.length > 1000
  ) {
    alert("Invalid input (Name max 100, Desc max 1000)");
    return;
  }

  formData.append("catid", document.getElementById("catid").value);
  formData.append("name", name);
  formData.append("price", price);
  formData.append("description", description);

  const imageFile = document.getElementById("image").files[0];
  if (imageFile) {
    formData.append("image", imageFile);
  }

  const res = await fetch("/api/products", {
    method: "POST",
    headers: {
      "x-csrf-token": csrfToken,
    },
    body: formData,
  });

  const data = await res.json();
  if (res.status === 403) {
    alert("CSRF error or Admin access required: " + data.error);
    return;
  }
  alert(JSON.stringify(data));
  if (res.ok) {
    e.target.reset();
  }
});

document
  .getElementById("updateProductForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const pid = document.getElementById("updatePid").value;
    const catid = document.getElementById("updateProductCatid").value;
    const name = document.getElementById("updateProductName").value.trim();
    const price = document.getElementById("updateProductPrice").value;
    const description = document
      .getElementById("updateProductDescription")
      .value.trim();

    if (
      !name ||
      name.length > 100 ||
      !price ||
      !description ||
      description.length > 1000
    ) {
      alert("Invalid input (Name max 100, Desc max 1000)");
      return;
    }

    const res = await fetch("/api/products/" + pid, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ catid, name, price, description }),
    });

    const data = await res.json();
    alert(JSON.stringify(data));
  });

document
  .getElementById("deleteProductForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const pid = document.getElementById("deletePid").value;

    const res = await fetch("/api/products/" + pid, {
      method: "DELETE",
      headers: {
        "x-csrf-token": csrfToken,
      },
    });

    const data = await res.json();
    alert(JSON.stringify(data));
  });

async function checkAdmin() {
  const res = await fetch("/api/user");
  const data = await res.json();
  if (!data.loggedIn || !data.user.isAdmin) {
    alert("Admin access required. Redirecting to home.");
    window.location.href = "/";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

async function loadOrders() {
  const container = document.getElementById("ordersContainer");
  container.innerHTML = "Loading...";
  const res = await fetch("/api/admin/orders", {
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) {
    container.innerHTML = "Failed to load orders: " + escapeHtml(data.error);
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = "No orders yet.";
    return;
  }

  const rows = data
    .map((o) => {
      const items = (o.items || [])
        .map(
          (it) =>
            `${escapeHtml(it.name)} (#${escapeHtml(it.pid)}) x ${escapeHtml(
              it.qty,
            )} @ ${escapeHtml(o.currency)} ${Number(it.price).toFixed(2)}`,
        )
        .join("<br/>");

      return `
        <tr>
          <td>${escapeHtml(o.order_id)}</td>
          <td>${escapeHtml(o.userid ?? "")}</td>
          <td>${escapeHtml(o.status)}</td>
          <td>${escapeHtml(o.currency)} ${Number(o.total).toFixed(2)}</td>
          <td>${escapeHtml(o.paypal_order_id ?? "")}</td>
          <td>${escapeHtml(o.payment_status ?? "")}</td>
          <td>${escapeHtml(o.capture_id ?? "")}</td>
          <td>${escapeHtml(o.payer_email ?? "")}</td>
          <td>${escapeHtml(o.created_at ?? "")}</td>
          <td>${escapeHtml(o.paid_at ?? "")}</td>
          <td>${items}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div style="overflow:auto; max-width: 100%">
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; min-width: 1000px">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>User ID</th>
            <th>Status</th>
            <th>Total</th>
            <th>PayPal Order</th>
            <th>Pay Status</th>
            <th>Capture ID</th>
            <th>Payer</th>
            <th>Created</th>
            <th>Paid</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

(async () => {
  await checkAdmin();
  await fetchCsrfToken();
  await loadCategories();
  document
    .getElementById("refreshOrdersBtn")
    .addEventListener("click", loadOrders);
  await loadOrders();
})();
