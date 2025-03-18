document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.container');
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';

    setTimeout(() => {
        container.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
    }, 200);
});

function toggleMenu() {
    const navLinks = document.querySelector('.nav-links');
    navLinks.classList.toggle('show');

    // ✅ Prevent body from scrolling ONLY when the menu is active
    if (navLinks.classList.contains('show')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'auto';
    }
}

// ✅ Close the menu when a link is clicked (for better UX)
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        const navLinks = document.querySelector('.nav-links');
        navLinks.classList.remove('show');
        document.body.style.overflow = 'auto';  // Restore scrolling
    });
});

function toggleDropdown() {
    const dropdown = document.getElementById("dropdown-menu");

    dropdown.classList.toggle("show");

    // Close dropdown when clicking outside
    document.addEventListener('click', function closeDropdown(event) {
        if (!event.target.closest('.profile-dropdown')) {
            dropdown.classList.remove("show");
            document.removeEventListener('click', closeDropdown); // Clean up listener
        }
    });
}

