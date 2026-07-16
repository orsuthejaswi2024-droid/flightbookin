/* -------------------------------------------------------------
   SKYFLOW APP LOGIC
   Frontend SPA Engine & Supabase API Integration
   ------------------------------------------------------------- */

let supabaseClient = null;
let currentUser = {
    name: '',
    role: '',       // 'customer' | 'employee'
    airline: ''     // 'Indigo' | 'Air India' | 'Vistara' (only for employees)
};

// Selection State for Seat Booking
let activeBookingState = {
    flightId: null,
    flightNumber: '',
    origin: '',
    destination: '',
    price: 0,
    selectedSeat: null
};

// Initialize Application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await initSupabaseConnection();
});

/* -------------------------------------------------------------
   1. CONNECTION SETUP (SUPABASE & CONFIGS)
   ------------------------------------------------------------- */

async function initSupabaseConnection() {
    let supabaseUrl = '';
    let supabaseAnonKey = '';

    // First try: Query the local backend config API
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            supabaseUrl = config.SUPABASE_URL;
            supabaseAnonKey = config.SUPABASE_ANON_KEY;
        }
    } catch (e) {
        console.warn("Backend server config fetch failed, relying on localStorage fallbacks.", e);
    }

    // Second try: Check local storage overrides
    if (!supabaseUrl || !supabaseAnonKey) {
        supabaseUrl = localStorage.getItem('SKYFLOW_SUPABASE_URL') || '';
        supabaseAnonKey = localStorage.getItem('SKYFLOW_SUPABASE_ANON_KEY') || '';
    }

    // If still missing, show the setup credentials modal
    if (!supabaseUrl || !supabaseAnonKey) {
        showConfigModal();
        return;
    }

    // Attempt client initialization
    try {
        supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
        
        // Hide config modal since credentials are provided
        hideConfigModal();
        
        // Restore session if available
        checkSessionRestore();

        // Run non-blocking connection verification query
        supabaseClient.from('flights').select('id').limit(1).then(({ error }) => {
            if (error) {
                console.warn("Supabase initialization check:", error.message);
                if (error.code === '42P01') {
                    showToast('Supabase connected! Please run schema.sql to create flights table.', 'warning');
                } else if (error.code === '42501') {
                    showToast('Supabase connected! Please verify RLS policies in schema.sql.', 'warning');
                } else {
                    showToast('Supabase connection warning: ' + error.message, 'warning');
                    showConfigModal(true);
                }
            } else {
                showToast('Successfully connected to Supabase!', 'success');
            }
        });
        
    } catch (error) {
        console.error("Supabase Client Creation Error:", error);
        showToast('Error initializing Supabase client.', 'danger');
        showConfigModal(true);
    }
}

function showConfigModal(isError = false) {
    const modal = document.getElementById('config-modal');
    modal.classList.remove('hidden');
    
    const dbUrlInput = document.getElementById('db-url-input');
    const dbAnonInput = document.getElementById('db-anon-input');
    
    dbUrlInput.value = localStorage.getItem('SKYFLOW_SUPABASE_URL') || '';
    dbAnonInput.value = localStorage.getItem('SKYFLOW_SUPABASE_ANON_KEY') || '';

    if (isError) {
        document.getElementById('config-error').classList.remove('hidden');
        document.getElementById('config-error').textContent = 'Invalid credentials or connection error. Please verify and try again.';
    }
}

function hideConfigModal() {
    document.getElementById('config-modal').classList.add('hidden');
    document.getElementById('config-error').classList.add('hidden');
}

/* -------------------------------------------------------------
   2. AUTHENTICATION & THEME CONTROLS
   ------------------------------------------------------------- */

function initEventListeners() {
    // Role selection toggle (adds airline selector for staff)
    const roleOptions = document.getElementsByName('user-role');
    roleOptions.forEach(opt => {
        opt.addEventListener('change', (e) => {
            const airlineGroup = document.getElementById('airline-select-group');
            if (e.target.value === 'employee') {
                airlineGroup.classList.remove('hidden');
            } else {
                airlineGroup.classList.add('hidden');
            }
        });
    });

    // Handle Login Form Submit
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('login-name').value.trim();
        const role = document.querySelector('input[name="user-role"]:checked').value;
        const airline = document.getElementById('login-airline').value;

        if (!name) {
            showToast('Please enter your name.', 'warning');
            return;
        }

        currentUser = { name, role, airline: role === 'employee' ? airline : '' };
        
        // Store session
        localStorage.setItem('SKYFLOW_SESSION', JSON.stringify(currentUser));
        
        setupDashboardTheme();
        enterDashboard();
    });

    // Handle Save Supabase Config Form Submit
    document.getElementById('save-config-btn').addEventListener('click', async () => {
        const url = document.getElementById('db-url-input').value.trim();
        const key = document.getElementById('db-anon-input').value.trim();

        if (!url || !key) {
            document.getElementById('config-error').classList.remove('hidden');
            document.getElementById('config-error').textContent = 'Both fields are required.';
            return;
        }

        localStorage.setItem('SKYFLOW_SUPABASE_URL', url);
        localStorage.setItem('SKYFLOW_SUPABASE_ANON_KEY', key);

        await initSupabaseConnection();
    });

    // Handle Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('SKYFLOW_SESSION');
        currentUser = { name: '', role: '', airline: '' };
        
        // Reset body classes and show login
        document.body.className = '';
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('main-nav').classList.add('hidden');
        document.getElementById('customer-dashboard').classList.add('hidden');
        document.getElementById('employee-dashboard').classList.add('hidden');
        
        showToast('Logged out successfully.', 'info');
    });

    // Customer Navigation Tabs
    const tabs = document.querySelectorAll('#customer-dashboard .tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetTab = tab.getAttribute('data-tab');
            const contents = document.querySelectorAll('#customer-dashboard .tab-content');
            contents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });

            if (targetTab === 'my-bookings-tab') {
                fetchCustomerBookings();
            }
        });
    });

    // Employee Navigation Tabs
    const empTabs = document.querySelectorAll('.employee-tab-btn');
    empTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            empTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetTab = tab.getAttribute('data-emp-tab');
            const contents = document.querySelectorAll('.employee-tab-content');
            contents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
        });
    });

    // Customer Search Flight Form
    document.getElementById('search-form').addEventListener('submit', (e) => {
        e.preventDefault();
        fetchFlightsForCustomer();
    });

    // Employee Schedule Flight Form
    document.getElementById('schedule-flight-form').addEventListener('submit', handleScheduleFlight);

    // Modal Close Triggers
    document.getElementById('close-seat-modal').addEventListener('click', closeSeatModal);
    document.getElementById('confirm-booking-btn').addEventListener('click', bookSeat);
}

function checkSessionRestore() {
    const sessionRaw = localStorage.getItem('SKYFLOW_SESSION');
    if (sessionRaw) {
        try {
            currentUser = JSON.parse(sessionRaw);
            setupDashboardTheme();
            enterDashboard();
        } catch (e) {
            localStorage.removeItem('SKYFLOW_SESSION');
        }
    }
}

function setupDashboardTheme() {
    // Clean old classes
    document.body.className = '';
    
    if (currentUser.role === 'employee') {
        const airlineClass = `theme-${currentUser.airline.toLowerCase().replace(/\s+/g, '')}`;
        document.body.classList.add(airlineClass);
        document.getElementById('nav-brand-badge').textContent = `${currentUser.airline} Staff`;
        document.getElementById('nav-brand-badge').className = 'brand-badge';
        document.getElementById('nav-brand-badge').classList.add(`airline-pill`, `${currentUser.airline.toLowerCase().replace(/\s+/g, '')}-pill`);
    } else {
        // Passengers get standard indigo theme
        document.body.classList.add('theme-indigo');
        document.getElementById('nav-brand-badge').textContent = 'Passenger Portal';
        document.getElementById('nav-brand-badge').className = 'brand-badge airline-pill indigo-pill';
    }

    // Set nav header values
    document.getElementById('nav-username').textContent = currentUser.name;
    document.getElementById('nav-user-role-lbl').textContent = currentUser.role === 'employee' ? 'Airline Operator' : 'Passenger';
}

function enterDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('main-nav').classList.remove('hidden');

    if (currentUser.role === 'customer') {
        document.getElementById('customer-dashboard').classList.remove('hidden');
        document.getElementById('employee-dashboard').classList.add('hidden');
        fetchFlightsForCustomer();
        updateBookingsBadge();
    } else {
        document.getElementById('customer-dashboard').classList.add('hidden');
        document.getElementById('employee-dashboard').classList.remove('hidden');
        loadEmployeeDashboard();
    }
}

/* -------------------------------------------------------------
   3. CUSTOMER DASHBOARD - FLIGHT LISTS & SEARCH
   ------------------------------------------------------------- */

async function fetchFlightsForCustomer() {
    const origin = document.getElementById('search-origin').value;
    const dest = document.getElementById('search-destination').value;
    const listContainer = document.getElementById('flights-list');
    
    listContainer.innerHTML = `<div class="text-center" style="padding:40px;"><i class="fa-solid fa-circle-notch fa-spin fa-2x text-primary"></i><p style="margin-top:10px; color:var(--text-muted);">Finding routes...</p></div>`;

    try {
        let query = supabaseClient.from('flights').select('*');

        if (origin) query = query.eq('origin', origin);
        if (dest) query = query.eq('destination', dest);
        
        // Sorting flights by date (earliest first)
        query = query.order('departure_time', { ascending: true });

        const { data: flights, error } = await query;
        if (error) throw error;

        // Render summary text
        const summary = document.getElementById('search-summary');
        if (origin || dest) {
            summary.textContent = `Found ${flights.length} flights matching: ${origin || 'Anywhere'} ➔ ${dest || 'Anywhere'}`;
        } else {
            summary.textContent = `Displaying all ${flights.length} active routes.`;
        }

        if (flights.length === 0) {
            listContainer.innerHTML = `
                <div class="card glass text-center" style="padding: 40px;">
                    <i class="fa-solid fa-plane-slash text-muted" style="font-size: 3rem; margin-bottom:15px;"></i>
                    <h4>No Flights Found</h4>
                    <p class="subtitle">Try choosing different cities or look for all flights.</p>
                </div>`;
            return;
        }

        // Fetch seat occupancy stats for the flights
        const { data: bookings, error: bError } = await supabaseClient
            .from('bookings')
            .select('flight_id');
        
        if (bError) throw bError;

        // Count seats filled per flight
        const occupancyMap = {};
        bookings.forEach(b => {
            occupancyMap[b.flight_id] = (occupancyMap[b.flight_id] || 0) + 1;
        });

        // Generate Cards
        listContainer.innerHTML = '';
        flights.forEach(flight => {
            const filledSeats = occupancyMap[flight.id] || 0;
            const availableSeats = flight.total_seats - filledSeats;
            const flightTime = new Date(flight.departure_time);
            
            // Format time nicely
            const formattedDate = flightTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const formattedTime = flightTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const airlineLower = flight.airline.toLowerCase().replace(/\s+/g, '');
            const card = document.createElement('div');
            card.className = 'flight-card glass animated-fade-in';
            // Set custom airline accent borders dynamically
            card.style.borderLeftColor = flight.airline === 'Indigo' ? '#3b82f6' : 
                                         flight.airline === 'Air India' ? '#ef4444' : '#8b5cf6';

            card.innerHTML = `
                <div class="flight-logo-section">
                    <span class="airline-pill ${airlineLower}-pill">${flight.airline}</span>
                    <span class="flight-number">${flight.flight_number}</span>
                </div>
                <div class="flight-route-section">
                    <div class="route-node">
                        <h4>${flight.origin}</h4>
                        <p>Origin</p>
                    </div>
                    <div class="route-arrow">
                        <div class="route-line"></div>
                        <p class="departure-lbl">${formattedDate} at ${formattedTime}</p>
                    </div>
                    <div class="route-node">
                        <h4>${flight.destination}</h4>
                        <p>Destination</p>
                    </div>
                </div>
                <div class="flight-price-section">
                    <span class="flight-price">₹${parseFloat(flight.price).toLocaleString('en-IN')}</span>
                    <span class="seats-left ${availableSeats <= 5 ? 'warning' : ''}">
                        ${availableSeats > 0 ? `${availableSeats} seats remaining` : 'SOLD OUT'}
                    </span>
                    <button class="btn btn-primary" onclick="openSeatModal(${flight.id}, '${flight.flight_number}', '${flight.origin}', '${flight.destination}', ${flight.price})" ${availableSeats === 0 ? 'disabled' : ''}>
                        ${availableSeats > 0 ? 'Select Seat & Book' : 'Fully Booked'}
                    </button>
                </div>
            `;
            listContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Flight Search Error:", error);
        showToast('Error loading flights. Please try again.', 'danger');
    }
}

/* -------------------------------------------------------------
   4. SEAT BOOKING SELECTION MODAL & PLOTS
   ------------------------------------------------------------- */

window.openSeatModal = async function(flightId, flightNumber, origin, destination, price) {
    activeBookingState = {
        flightId,
        flightNumber,
        origin,
        destination,
        price,
        selectedSeat: null
    };

    // Update Modal Information Headers
    document.getElementById('seat-modal-flight-no').textContent = flightNumber;
    document.getElementById('seat-modal-route').textContent = `${origin} to ${destination}`;
    document.getElementById('seat-modal-price').textContent = `₹${price.toLocaleString('en-IN')}`;
    document.getElementById('selected-seat-badge').textContent = '-';
    
    const confirmBtn = document.getElementById('confirm-booking-btn');
    confirmBtn.disabled = true;

    // Show Modal
    document.getElementById('seat-modal').classList.remove('hidden');

    // Load Occupied Seats from Database
    const gridContainer = document.getElementById('seats-layout-grid');
    gridContainer.innerHTML = `<div class="text-center" style="padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading layout...</div>`;

    try {
        const { data: bookings, error } = await supabaseClient
            .from('bookings')
            .select('seat_number')
            .eq('flight_id', flightId);

        if (error) throw error;

        const occupiedSeats = new Set(bookings.map(b => b.seat_number));

        // Generate Seat Grid Map
        // Standard plane seat grid: 10 rows (1 to 10), seats A, B, C, (aisle), D, E, F
        gridContainer.innerHTML = '';
        const rows = 10;
        const seatLetters = ['A', 'B', 'C', 'AISLE', 'D', 'E', 'F'];

        for (let r = 1; r <= rows; r++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'seat-row';

            // Add row label
            const rowLabel = document.createElement('span');
            rowLabel.className = 'seat-row-num';
            rowLabel.textContent = r;
            rowDiv.appendChild(rowLabel);

            seatLetters.forEach(letter => {
                if (letter === 'AISLE') {
                    // Empty space for aisle
                    const aisleSpan = document.createElement('span');
                    rowDiv.appendChild(aisleSpan);
                } else {
                    const seatId = `${r}${letter}`;
                    const isOccupied = occupiedSeats.has(seatId);

                    const seatBtn = document.createElement('button');
                    seatBtn.className = `seat-box ${isOccupied ? 'seat-occupied' : 'seat-available'}`;
                    seatBtn.textContent = seatId;
                    seatBtn.setAttribute('title', isOccupied ? `Seat ${seatId} is already booked` : `Select Seat ${seatId}`);

                    if (isOccupied) {
                        seatBtn.disabled = true;
                    } else {
                        seatBtn.addEventListener('click', () => selectSeat(seatId, seatBtn));
                    }

                    rowDiv.appendChild(seatBtn);
                }
            });

            // Add row label on the other side as well for symmetry
            const rowLabelRight = document.createElement('span');
            rowLabelRight.className = 'seat-row-num';
            rowLabelRight.textContent = r;
            rowDiv.appendChild(rowLabelRight);

            gridContainer.appendChild(rowDiv);
        }

    } catch (e) {
        console.error("Seat Grid Fetch Error:", e);
        showToast('Error loading flight seating map.', 'danger');
    }
}

function selectSeat(seatId, element) {
    // Unselect previous
    const previouslySelected = document.querySelector('.seat-selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('seat-selected');
        previouslySelected.classList.add('seat-available');
    }

    // Select new
    element.classList.remove('seat-available');
    element.classList.add('seat-selected');

    // Update state
    activeBookingState.selectedSeat = seatId;
    document.getElementById('selected-seat-badge').textContent = seatId;

    // Enable button
    const confirmBtn = document.getElementById('confirm-booking-btn');
    confirmBtn.disabled = false;
}

function closeSeatModal() {
    document.getElementById('seat-modal').classList.add('hidden');
    activeBookingState = { flightId: null, flightNumber: '', origin: '', destination: '', price: 0, selectedSeat: null };
}

async function bookSeat() {
    if (!activeBookingState.flightId || !activeBookingState.selectedSeat) return;

    const confirmBtn = document.getElementById('confirm-booking-btn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

    try {
        const { error } = await supabaseClient
            .from('bookings')
            .insert({
                flight_id: activeBookingState.flightId,
                customer_name: currentUser.name,
                seat_number: activeBookingState.selectedSeat
            });

        if (error) {
            // Check for unique constraint violation
            if (error.code === '23505') {
                showToast('This seat was just booked by another user. Please choose another.', 'danger');
            } else {
                throw error;
            }
            // Re-fetch layout
            openSeatModal(activeBookingState.flightId, activeBookingState.flightNumber, activeBookingState.origin, activeBookingState.destination, activeBookingState.price);
            return;
        }

        showToast(`Successfully booked seat ${activeBookingState.selectedSeat}!`, 'success');
        closeSeatModal();
        
        // Refresh listings
        fetchFlightsForCustomer();
        updateBookingsBadge();

    } catch (e) {
        console.error("Booking Error:", e);
        showToast('Failed to complete seat reservation.', 'danger');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> Confirm Booking`;
    }
}

/* -------------------------------------------------------------
   5. CUSTOMER DASHBOARD - "MY BOOKINGS" & BOARDING PASS
   ------------------------------------------------------------- */

async function fetchCustomerBookings() {
    const listContainer = document.getElementById('bookings-list');
    listContainer.innerHTML = `<div class="text-center" style="grid-column: 1/-1; padding:40px;"><i class="fa-solid fa-circle-notch fa-spin fa-2x text-primary"></i><p style="margin-top:10px;">Retrieving bookings...</p></div>`;

    try {
        // Fetch bookings matching name
        const { data: bookings, error } = await supabaseClient
            .from('bookings')
            .select(`
                id,
                seat_number,
                booking_date,
                flights (
                    id,
                    flight_number,
                    origin,
                    destination,
                    departure_time,
                    airline,
                    price
                )
            `)
            .eq('customer_name', currentUser.name)
            .order('booking_date', { ascending: false });

        if (error) throw error;

        if (bookings.length === 0) {
            listContainer.innerHTML = `
                <div class="card glass text-center" style="grid-column: 1/-1; padding: 40px;">
                    <i class="fa-solid fa-ticket-simple text-muted" style="font-size: 3rem; margin-bottom:15px;"></i>
                    <h4>No Boarding Passes Yet</h4>
                    <p class="subtitle">You don't have any booked flight tickets right now.</p>
                </div>`;
            return;
        }

        listContainer.innerHTML = '';
        bookings.forEach(b => {
            const flight = b.flights;
            const departureTime = new Date(flight.departure_time);
            
            const formattedDate = departureTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const formattedTime = departureTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const airlineClass = `theme-${flight.airline.toLowerCase().replace(/\s+/g, '')}`;
            const airlineBadgeColor = flight.airline === 'Indigo' ? 'indigo-pill' : 
                                      flight.airline === 'Air India' ? 'airindia-pill' : 'vistara-pill';

            const pass = document.createElement('div');
            pass.className = 'boarding-pass animated-fade-in';
            
            // Apply unique header color based on ticket airline
            let airlineHeaderBg = 'var(--primary)';
            if (flight.airline === 'Indigo') airlineHeaderBg = '#1e3a8a';
            else if (flight.airline === 'Air India') airlineHeaderBg = '#b91c1c';
            else if (flight.airline === 'Vistara') airlineHeaderBg = '#4c1d95';

            pass.innerHTML = `
                <div class="pass-header" style="background-color: ${airlineHeaderBg}">
                    <span class="airline-name"><i class="fa-solid fa-plane"></i> ${flight.airline}</span>
                    <span class="class-lbl">Economy Class</span>
                </div>
                <div class="pass-body">
                    <div class="pass-route">
                        <div class="pass-node">
                            <h3>${flight.origin}</h3>
                            <p>Origin Place</p>
                        </div>
                        <div class="pass-arrow"></div>
                        <div class="pass-node" style="text-align: right;">
                            <h3>${flight.destination}</h3>
                            <p>Destination</p>
                        </div>
                    </div>
                    <div class="pass-details">
                        <div class="pass-detail-item">
                            <label>Passenger Name</label>
                            <span>${currentUser.name}</span>
                        </div>
                        <div class="pass-detail-item">
                            <label>Flight No</label>
                            <span>${flight.flight_number}</span>
                        </div>
                        <div class="pass-detail-item">
                            <label>Departure Date</label>
                            <span>${formattedDate}</span>
                        </div>
                        <div class="pass-detail-item">
                            <label>Boarding Time</label>
                            <span>${formattedTime}</span>
                        </div>
                        <div class="pass-detail-item">
                            <label>Seat Number</label>
                            <span class="text-primary" style="font-size: 1.1rem; font-weight:700;">${b.seat_number}</span>
                        </div>
                        <div class="pass-detail-item">
                            <label>Gate</label>
                            <span>G-12</span>
                        </div>
                    </div>
                </div>
                <div class="pass-footer">
                    <div class="mock-barcode"></div>
                    <button class="btn btn-danger" onclick="cancelBooking('${b.id}', '${flight.flight_number}')" title="Cancel Booking">
                        <i class="fa-solid fa-xmark"></i> Cancel
                    </button>
                </div>
            `;
            listContainer.appendChild(pass);
        });

    } catch (e) {
        console.error("Fetch Bookings Error:", e);
        showToast('Error loading boarding passes.', 'danger');
    }
}

window.cancelBooking = async function(bookingId, flightNumber) {
    if (!confirm(`Are you sure you want to cancel your booking for Flight ${flightNumber}? This will free up the seat.`)) return;

    try {
        const { error } = await supabaseClient
            .from('bookings')
            .delete()
            .eq('id', bookingId);

        if (error) throw error;

        showToast('Booking cancelled successfully.', 'success');
        
        // Refresh views
        fetchCustomerBookings();
        updateBookingsBadge();

    } catch (e) {
        console.error("Cancel Booking Error:", e);
        showToast('Could not cancel ticket booking.', 'danger');
    }
}

async function updateBookingsBadge() {
    try {
        const { count, error } = await supabaseClient
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('customer_name', currentUser.name);

        if (error) throw error;

        const badge = document.getElementById('booking-badge');
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (e) {
        console.warn("Could not load bookings count", e);
    }
}

/* -------------------------------------------------------------
   6. AIRLINE EMPLOYEE - LISTS, STATS, ACTIONS
   ------------------------------------------------------------- */

async function loadEmployeeDashboard() {
    await fetchEmployeeFlights();
    await fetchEmployeeBookings();
    await calculateEmployeeStats();
}

async function fetchEmployeeFlights() {
    const tbody = document.getElementById('emp-flights-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center"><i class="fa-solid fa-circle-notch fa-spin"></i> Syncing flights...</td></tr>`;

    try {
        const { data: flights, error } = await supabaseClient
            .from('flights')
            .select('*')
            .eq('airline', currentUser.airline)
            .order('departure_time', { ascending: true });

        if (error) throw error;

        if (flights.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No scheduled flights for ${currentUser.airline}. Use the form to schedule one.</td></tr>`;
            return;
        }

        // Fetch seat counts
        const { data: bookings, error: bError } = await supabaseClient.from('bookings').select('flight_id');
        if (bError) throw bError;

        const bookedMap = {};
        bookings.forEach(b => {
            bookedMap[b.flight_id] = (bookedMap[b.flight_id] || 0) + 1;
        });

        tbody.innerHTML = '';
        flights.forEach(f => {
            const filled = bookedMap[f.id] || 0;
            const departureTime = new Date(f.departure_time);
            const formattedDate = departureTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + departureTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${f.flight_number}</strong></td>
                <td>${f.origin} ➔ ${f.destination}</td>
                <td>${formattedDate}</td>
                <td>₹${parseFloat(f.price).toLocaleString('en-IN')}</td>
                <td>${f.total_seats - filled} / ${f.total_seats} free</td>
                <td>
                    <button class="btn btn-danger" style="padding: 6px 12px; font-size:0.8rem;" onclick="cancelFlight(${f.id}, '${f.flight_number}')">
                        <i class="fa-solid fa-trash"></i> Cancel Flight
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (e) {
        console.error("Load Employee Flights Error:", e);
        showToast('Error fetching flights list.', 'danger');
    }
}

async function fetchEmployeeBookings() {
    const tbody = document.getElementById('emp-bookings-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center"><i class="fa-solid fa-circle-notch fa-spin"></i> Retrieving manifest...</td></tr>`;

    try {
        // Fetch bookings inner-joining flights belonging to this airline
        const { data: bookings, error } = await supabaseClient
            .from('bookings')
            .select(`
                id,
                customer_name,
                seat_number,
                booking_date,
                flights!inner (
                    id,
                    flight_number,
                    origin,
                    destination,
                    airline
                )
            `)
            .eq('flights.airline', currentUser.airline)
            .order('booking_date', { ascending: false });

        if (error) throw error;

        if (bookings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No passengers have booked flights on your airline yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        bookings.forEach(b => {
            const f = b.flights;
            const bDate = new Date(b.booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + new Date(b.booking_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${b.customer_name}</strong></td>
                <td><span class="badge" style="background-color: var(--primary);">${f.flight_number}</span></td>
                <td>${f.origin} ➔ ${f.destination}</td>
                <td><span class="text-primary" style="font-weight:700;">${b.seat_number}</span></td>
                <td>${bDate}</td>
                <td>
                    <button class="btn btn-danger" style="padding: 6px 12px; font-size:0.8rem;" onclick="removePassenger('${b.id}', '${b.customer_name}')">
                        <i class="fa-solid fa-user-minus"></i> Remove
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (e) {
        console.error("Load Employee Bookings Error:", e);
        showToast('Error fetching manifest details.', 'danger');
    }
}

async function calculateEmployeeStats() {
    try {
        // Load flights
        const { data: flights, error: fError } = await supabaseClient
            .from('flights')
            .select('id, price')
            .eq('airline', currentUser.airline);

        if (fError) throw fError;

        document.getElementById('stat-total-flights').textContent = flights.length;

        if (flights.length === 0) {
            document.getElementById('stat-passengers').textContent = '0';
            document.getElementById('stat-revenue').textContent = '₹0';
            return;
        }

        const flightIds = flights.map(f => f.id);

        // Load bookings for these flights
        const { data: bookings, error: bError } = await supabaseClient
            .from('bookings')
            .select('flight_id')
            .in('flight_id', flightIds);

        if (bError) throw bError;

        const totalBookings = bookings.length;
        document.getElementById('stat-passengers').textContent = totalBookings;

        // Calculate Revenue
        // Match bookings to flight prices
        const priceMap = {};
        flights.forEach(f => {
            priceMap[f.id] = parseFloat(f.price);
        });

        let totalRevenue = 0;
        bookings.forEach(b => {
            totalRevenue += priceMap[b.flight_id] || 0;
        });

        document.getElementById('stat-revenue').textContent = `₹${totalRevenue.toLocaleString('en-IN')}`;

    } catch (e) {
        console.error("Calculate Stats Error:", e);
    }
}

async function handleScheduleFlight(e) {
    e.preventDefault();

    const flightNumber = document.getElementById('flight-number-input').value.trim();
    const origin = document.getElementById('flight-origin-input').value;
    const destination = document.getElementById('flight-dest-input').value;
    const price = parseFloat(document.getElementById('flight-price-input').value);
    const seats = parseInt(document.getElementById('flight-seats-input').value);
    const departureTime = document.getElementById('flight-time-input').value;

    if (origin === destination) {
        showToast("Origin and Destination cannot be the same.", "warning");
        return;
    }

    if (new Date(departureTime) < new Date()) {
        showToast("Departure time cannot be in the past.", "warning");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('flights')
            .insert({
                airline: currentUser.airline,
                flight_number: flightNumber,
                origin,
                destination,
                price,
                total_seats: seats,
                departure_time: new Date(departureTime).toISOString()
            });

        if (error) throw error;

        showToast(`Flight ${flightNumber} scheduled successfully!`, 'success');
        document.getElementById('schedule-flight-form').reset();
        
        // Refresh dashboard tables
        loadEmployeeDashboard();

    } catch (e) {
        console.error("Insert Flight Error:", e);
        showToast('Error scheduling flight.', 'danger');
    }
}

window.cancelFlight = async function(flightId, flightNo) {
    if (!confirm(`Warning: Cancelling Flight ${flightNo} will cancel all existing customer seat reservations on this flight. Continue?`)) return;

    try {
        const { error } = await supabaseClient
            .from('flights')
            .delete()
            .eq('id', flightId);

        if (error) throw error;

        showToast(`Flight ${flightNo} and its bookings deleted.`, 'success');
        loadEmployeeDashboard();

    } catch (e) {
        console.error("Cancel Flight Error:", e);
        showToast('Error deleting flight.', 'danger');
    }
}

window.removePassenger = async function(bookingId, passengerName) {
    if (!confirm(`Remove ${passengerName} from this flight's manifest?`)) return;

    try {
        const { error } = await supabaseClient
            .from('bookings')
            .delete()
            .eq('id', bookingId);

        if (error) throw error;

        showToast(`Passenger booking removed successfully.`, 'success');
        loadEmployeeDashboard();

    } catch (e) {
        console.error("Remove Passenger Error:", e);
        showToast('Could not remove passenger booking.', 'danger');
    }
}

/* -------------------------------------------------------------
   7. TOAST NOTIFICATION CONTAINER SYSTEM
   ------------------------------------------------------------- */

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    else if (type === 'danger') icon = 'fa-triangle-exclamation';
    else if (type === 'warning') icon = 'fa-circle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Fade out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
        toast.style.transition = 'all 0.4s ease';
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 4000);
}
