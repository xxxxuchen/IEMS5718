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

(async () => {
  await checkAdmin();
  await fetchCsrfToken();
  await loadCategories();
})();
