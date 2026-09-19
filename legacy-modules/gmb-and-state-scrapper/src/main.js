document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    app.innerHTML = `
        <section class="hero">
            <h2>Find the Best Local Businesses</h2>
            <p>Your one-stop shop for professional services.</p>
        </section>
        <section class="search-bar">
            <input type="text" placeholder="Search for businesses...">
            <button>Search</button>
        </section>
    `;
    console.log('BizFinder Pro initialized.');
});
