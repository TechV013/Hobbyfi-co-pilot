import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SPORTS_VENDOR = {
  id: 'vendor-a-0001-0000-0000-000000000001',
  name: 'Sharma Sports Academy',
  academyName: 'Sharma Sports Academy',
  city: 'Mumbai',
  sportsOffered: 'Cricket,Football,Badminton',
  subscriptionPlan: 'enterprise',
};

const FITNESS_VENDOR = {
  id: 'vendor-b-0002-0000-0000-000000000002',
  name: 'Patel Fitness Hub',
  academyName: 'Patel Fitness Hub',
  city: 'Delhi',
  sportsOffered: 'Yoga,Swimming,Gym',
  subscriptionPlan: 'pro',
};

const TEST_VENDOR = {
  id: 'test-vendor',
  name: 'Champion Sports Academy',
  academyName: 'Champion Sports Academy',
  city: 'Mumbai',
  sportsOffered: 'Cricket,Football,Badminton,Swimming,Yoga',
  subscriptionPlan: 'enterprise',
};

async function seedVendor(v: typeof SPORTS_VENDOR) {
  return prisma.vendor.upsert({
    where: { id: v.id },
    update: {},
    create: v,
  });
}

async function seedMembers(vendorId: string, members: Array<{
  id: string; name: string; phone: string; email?: string;
  sport: string; membershipType: string; trialStatus: boolean;
  coach: string | null; membershipStart: Date; membershipEnd: Date;
}>) {
  for (const m of members) {
    await prisma.user.upsert({
      where: { id: m.id },
      update: {},
      create: {
        id: m.id,
        vendorId,
        name: m.name,
        phone: m.phone,
        email: m.email ?? null,
        sport: m.sport,
        membershipType: m.membershipType,
        trialStatus: m.trialStatus,
        coachAssigned: m.coach ?? null,
        membershipStart: m.membershipStart,
        membershipEnd: m.membershipEnd,
      },
    });
  }
}

async function seedRevenue(vendorId: string, days: number) {
  const records = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const baseOnline = isWeekend ? randomInt(4000, 8000) : randomInt(2000, 5000);
    const baseOffline = isWeekend ? randomInt(3000, 6000) : randomInt(1000, 3500);
    const onlineRevenue = baseOnline + randomInt(-500, 500);
    const offlineRevenue = baseOffline + randomInt(-300, 300);
    const totalRevenue = onlineRevenue + offlineRevenue;

    records.push(
      prisma.revenue.upsert({
        where: { vendorId_date: { vendorId, date } },
        update: { onlineRevenue, offlineRevenue, totalRevenue },
        create: { vendorId, date, onlineRevenue, offlineRevenue, totalRevenue },
      }),
    );
  }

  await Promise.all(records);
}

async function seedBookings(vendorId: string) {
  const users = await prisma.user.findMany({ where: { vendorId } });
  if (users.length === 0) return;

  const slots = ['6:00-7:00 AM', '7:00-8:00 AM', '4:00-5:00 PM', '5:00-6:00 PM', '6:00-7:00 PM'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 14; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const numBookings = randomInt(2, 4);

    for (let j = 0; j < numBookings; j++) {
      const user = users[randomInt(0, users.length - 1)];
      const slot = slots[randomInt(0, slots.length - 1)];
      const status = i < 2 ? 'confirmed' : (['confirmed', 'completed', 'cancelled'])[randomInt(0, 2)];

      const booking = await prisma.booking.create({
        data: {
          vendorId,
          userId: user.id,
          sport: user.sport,
          slot,
          date,
          status,
        },
      });

      if (status !== 'cancelled' && Math.random() > 0.3) {
        const amount = randomInt(500, 5000);
        const methods = ['cash', 'online', 'card', 'upi'];
        const paidAt = new Date(date);
        paidAt.setHours(randomInt(6, 20), randomInt(0, 59), 0, 0);

        await prisma.payment.create({
          data: {
            vendorId,
            bookingId: booking.id,
            userId: user.id,
            amount,
            method: methods[randomInt(0, methods.length - 1)],
            status: 'completed',
            paidAt,
          },
        });
      }
    }
  }
}

async function seedVendorPreferences(vendorId: string, sport: string) {
  await prisma.vendorPreference.upsert({
    where: { vendorId },
    update: {},
    create: {
      vendorId,
      defaultSportFilter: null,
      favoriteReports: JSON.stringify(['revenue_summary', 'member_growth']),
      frequentlyUsedFilters: JSON.stringify({ sport, timeframe: 'this_month' }),
      preferredLanguage: 'en',
      timezone: 'Asia/Kolkata',
    },
  });
}

async function main() {
  console.log('Seeding demo data...\n');

  // === SHARMA SPORTS ACADEMY (Sports - Cricket, Football, Badminton) ===
  const sports = await seedVendor(SPORTS_VENDOR);
  console.log(`✓ ${sports.academyName} (${sports.city})`);

  await seedMembers(sports.id, [
    { id: 's-user-1', name: 'Rahul Sharma', phone: '9876543001', email: 'rahul@sharma.in', sport: 'Cricket', membershipType: 'yearly', trialStatus: false, coach: 'Suresh Kumar', membershipStart: new Date('2024-06-01'), membershipEnd: new Date('2025-06-01') },
    { id: 's-user-2', name: 'Amit Verma', phone: '9876543002', email: 'amit@example.com', sport: 'Cricket', membershipType: 'monthly', trialStatus: false, coach: 'Suresh Kumar', membershipStart: new Date('2024-12-01'), membershipEnd: new Date('2025-01-01') },
    { id: 's-user-3', name: 'Vikram Joshi', phone: '9876543003', sport: 'Football', membershipType: 'quarterly', trialStatus: false, coach: 'Vikram Singh', membershipStart: new Date('2024-10-01'), membershipEnd: new Date('2025-01-01') },
    { id: 's-user-4', name: 'Sneha Reddy', phone: '9876543004', email: 'sneha@example.com', sport: 'Badminton', membershipType: 'yearly', trialStatus: false, coach: 'Anita Desai', membershipStart: new Date('2024-04-01'), membershipEnd: new Date('2025-04-01') },
    { id: 's-user-5', name: 'Arjun Nair', phone: '9876543005', sport: 'Football', membershipType: 'monthly', trialStatus: true, coach: null, membershipStart: new Date('2024-12-20'), membershipEnd: new Date('2025-01-20') },
    { id: 's-user-6', name: 'Kavita Sharma', phone: '9876543006', email: 'kavita@example.com', sport: 'Badminton', membershipType: 'quarterly', trialStatus: false, coach: 'Anita Desai', membershipStart: new Date('2024-11-01'), membershipEnd: new Date('2025-02-01') },
  ]);
  console.log('  → 6 members (Cricket, Football, Badminton)');

  await seedRevenue(sports.id, 90);
  console.log('  → 90 days revenue data');

  await seedBookings(sports.id);
  console.log('  → Bookings & payments');

  await seedVendorPreferences(sports.id, 'Cricket');
  console.log('  → Preferences set');

  // === PATEL FITNESS HUB (Fitness - Yoga, Swimming, Gym) ===
  const fitness = await seedVendor(FITNESS_VENDOR);
  console.log(`\n✓ ${fitness.academyName} (${fitness.city})`);

  await seedMembers(fitness.id, [
    { id: 'f-user-1', name: 'Priya Patel', phone: '9876543101', email: 'priya@patel.in', sport: 'Yoga', membershipType: 'yearly', trialStatus: false, coach: 'Meera Nair', membershipStart: new Date('2024-06-01'), membershipEnd: new Date('2025-06-01') },
    { id: 'f-user-2', name: 'Rohit Gupta', phone: '9876543102', sport: 'Swimming', membershipType: 'monthly', trialStatus: true, coach: null, membershipStart: new Date('2024-12-15'), membershipEnd: new Date('2025-01-15') },
    { id: 'f-user-3', name: 'Neha Kapoor', phone: '9876543103', email: 'neha@example.com', sport: 'Gym', membershipType: 'quarterly', trialStatus: false, coach: 'Ravi Deshmukh', membershipStart: new Date('2024-10-01'), membershipEnd: new Date('2025-01-01') },
    { id: 'f-user-4', name: 'Deepak Yadav', phone: '9876543104', sport: 'Yoga', membershipType: 'monthly', trialStatus: false, coach: 'Meera Nair', membershipStart: new Date('2024-12-01'), membershipEnd: new Date('2025-01-01') },
    { id: 'f-user-5', name: 'Ananya Iyer', phone: '9876543105', email: 'ananya@example.com', sport: 'Swimming', membershipType: 'yearly', trialStatus: false, coach: null, membershipStart: new Date('2024-03-01'), membershipEnd: new Date('2025-03-01') },
    { id: 'f-user-6', name: 'Pooja Deshmukh', phone: '9876543106', email: 'pooja@example.com', sport: 'Gym', membershipType: 'monthly', trialStatus: false, coach: 'Ravi Deshmukh', membershipStart: new Date('2024-12-01'), membershipEnd: new Date('2025-01-01') },
  ]);
  console.log('  → 6 members (Yoga, Swimming, Gym)');

  await seedRevenue(fitness.id, 90);
  console.log('  → 90 days revenue data');

  await seedBookings(fitness.id);
  console.log('  → Bookings & payments');

  await seedVendorPreferences(fitness.id, 'Yoga');
  console.log('  → Preferences set');

  // === LEGACY TEST VENDOR (backward compat) ===
  const test = await seedVendor(TEST_VENDOR);
  console.log(`\n✓ ${test.academyName} (test-vendor, backward compat)`);

  await seedMembers(test.id, [
    { id: 'test-user-1', name: 'Rahul Sharma', phone: '9876543210', email: 'rahul@example.com', sport: 'Cricket', membershipType: 'yearly', trialStatus: false, coach: 'Suresh Kumar', membershipStart: new Date('2024-06-01'), membershipEnd: new Date('2025-06-01') },
    { id: 'test-user-2', name: 'Priya Patel', phone: '9876543211', email: 'priya@example.com', sport: 'Football', membershipType: 'quarterly', trialStatus: false, coach: 'Vikram Singh', membershipStart: new Date('2024-10-01'), membershipEnd: new Date('2025-01-01') },
    { id: 'test-user-3', name: 'Amit Singh', phone: '9876543212', email: 'amit@example.com', sport: 'Cricket', membershipType: 'monthly', trialStatus: false, coach: 'Suresh Kumar', membershipStart: new Date('2024-12-01'), membershipEnd: new Date('2025-01-01') },
  ]);
  console.log('  → 3 legacy members');

  await seedRevenue(test.id, 90);
  console.log('  → 90 days revenue data');

  console.log('\n✓ All demo data ready!');
  console.log('  Login as:');
  console.log('  • Sharma Sports Academy  (Cricket, Football, Badminton)');
  console.log('  • Patel Fitness Hub       (Yoga, Swimming, Gym)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
