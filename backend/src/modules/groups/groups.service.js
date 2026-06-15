import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

export async function createGroup(userId, name, description, currency = 'USD') {
  return prisma.$transaction(async (tx) => {
    // 1. Create the Group
    const group = await tx.group.create({
      data: {
        name,
        description,
        currency,
        creatorId: userId
      }
    });

    // 2. Add the creator as an ADMIN member of the group
    await tx.groupMember.create({
      data: {
        groupId: group.id,
        userId: userId,
        role: 'ADMIN'
      }
    });

    return group;
  });
}

export async function getUserGroups(userId) {
  // Fetch all groups where the user is an active member
  return prisma.group.findMany({
    where: {
      members: {
        some: {
          userId: userId,
          leftAt: null // Only active memberships
        }
      }
    },
    include: {
      members: {
        where: { leftAt: null }, // Return only active members
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      }
    }
  });
}

export async function getGroupDetails(groupId, userId) {
  // Verify the user is actually a member of this group before returning data
  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId }
    }
  });

  if (!membership || membership.leftAt) {
    throw new Error('You do not have permission to view this group');
  }

  return prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      }
    }
  });
}

export async function addMember(groupId, adminUserId, memberEmail) {
  // 1. Verify the requester is an ADMIN of the group
  const adminMembership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: adminUserId }
    }
  });

  if (!adminMembership || adminMembership.role !== 'ADMIN' || adminMembership.leftAt) {
    throw new Error('Only active group admins can add new members');
  }

  // 2. Find the user being added
  const userToAdd = await prisma.user.findUnique({
    where: { email: memberEmail }
  });

  if (!userToAdd) {
    throw new Error('User with this email not found');
  }

  // 3. Check if they are already in the group
  const existingMembership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: userToAdd.id }
    }
  });

  if (existingMembership && !existingMembership.leftAt) {
    throw new Error('User is already an active member of this group');
  }

  if (existingMembership && existingMembership.leftAt) {
    // If they were previously removed, reactivate their membership
    return prisma.groupMember.update({
      where: { id: existingMembership.id },
      data: { leftAt: null }
    });
  }

  // 4. Add them as a new MEMBER
  return prisma.groupMember.create({
    data: {
      groupId,
      userId: userToAdd.id,
      role: 'MEMBER'
    }
  });
}

export async function updateGroup(groupId, adminUserId, name, description) {
  const adminMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: adminUserId } }
  });
  if (!adminMembership || adminMembership.role !== 'ADMIN' || adminMembership.leftAt) {
    throw new Error('Only active group admins can update the group');
  }
  return prisma.group.update({
    where: { id: groupId },
    data: { name, description }
  });
}

export async function removeMember(groupId, adminUserId, memberId) {
  const adminMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: adminUserId } }
  });
  if (!adminMembership || adminMembership.role !== 'ADMIN' || adminMembership.leftAt) {
    throw new Error('Only active group admins can remove members');
  }
  return prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId: memberId } },
    data: { leftAt: new Date() }
  });
}
