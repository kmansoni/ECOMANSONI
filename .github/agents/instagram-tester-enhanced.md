# Enhanced Instagram Tester - Implementation Details

## Feed Algorithm Testing

### Feed Ranking Tests
```typescript
describe('Feed Ranking', () => {
  test('Chronological feed ordering', async () => {
    const posts = await createPostsInOrder(user, 10);
    const feed = await getFeed(user, 'chronological');
    expect(feed.map(p => p.id)).toEqual(posts.map(p => p.id));
  });

  test('Ranked feed relevance scoring', async () => {
    const posts = await createMixedPosts(user);
    const ranked = await getRankedFeed(user);
    expect(ranked[0].relevanceScore).toBeGreaterThan(ranked[1].relevanceScore);
  });

  test('Explore page personalization', async () => {
    await user.likePosts(['travel', 'food']);
    const explore = await getExplore(user);
    expect(explore.topCategories).toContain('travel');
  });
});
```

## Media Processing Tests

### Image Upload Pipeline
```typescript
describe('Image Processing', () => {
  test('Multi-size thumbnail generation', async () => {
    const upload = await uploadImage('test.jpg');
    expect(upload.sizes).toEqual({
      original: { width: 1080, height: 1080 },
      thumbnail: { width: 150, height: 150 },
      medium: { width: 640, height: 640 }
    });
  });

  test('Video transcoding for Reels', async () => {
    const video = await uploadVideo('reel.mp4');
    const transcoded = await transcodeForReels(video);
    expect(transcoded.formats).toContain('mp4_720p');
    expect(transcoded.duration).toBeLessThan(90);
  });

  test('Carousel creation', async () => {
    const carousel = await createCarousel([img1, img2, img3]);
    expect(carousel.slides.length).toBe(3);
    expect(carousel.coverImage).toBeDefined();
  });
});
```

## Story Feature Tests

### Story Lifecycle
```typescript
describe('Stories', () => {
  test('24-hour auto-expiry', async () => {
    const story = await createStory(user, { expiresIn: 24 * 60 * 60 * 1000 });
    await advanceTime(25 * 60 * 60 * 1000);
    await expect(getStory(story.id)).rejects.toThrow('EXPIRED');
  });

  test('Story highlights persistence', async () => {
    const story = await createStory(user);
    await addToHighlight(story, 'Vacation');
    await story.expire();
    const highlight = await getHighlight('Vacation');
    expect(highlight.stories).toContain(story.id);
  });

  test('Interactive stickers - polls', async () => {
    const story = await createStoryWithPoll(user, 'Which one?', ['A', 'B']);
    await user2.voteOnPoll(story.id, 0);
    const results = await getPollResults(story.id);
    expect(results.votes[0]).toBe(1);
  });
});
```

## Reels Specific Tests

### Video Editing Pipeline
```typescript
describe('Reels Creation', () => {
  test('Multi-clip concatenation', async () => {
    const clips = await uploadClips(['clip1.mp4', 'clip2.mp4']);
    const reel = await concatenateClips(clips);
    expect(reel.duration).toBe(clips.reduce((sum, c) => sum + c.duration, 0));
  });

  test('Audio track synchronization', async () => {
    const reel = await createReelWithAudio('video.mp4', 'music.mp3');
    expect(reel.audioOffset).toBe(0);
    expect(reel.syncPoints.length).toBeGreaterThan(0);
  });

  test('Effects application performance', async () => {
    const startTime = performance.now();
    const reel = await applyEffects('video.mp4', ['filter1', 'transition2']);
    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(5000);
  });
});
```

## Social Feature Tests

### Comment Thread Management
```typescript
describe('Comments', () => {
  test('Nested comment replies', async () => {
    const post = await createPost(user);
    const comment1 = await post.addComment(user, 'First');
    const reply = await comment1.addReply(user2, 'Reply');
    expect(reply.parentId).toBe(comment1.id);
  });

  test('Comment moderation - hide/delete', async () => {
    const comment = await post.addComment(troll, 'Spam');
    await post.hideComment(comment.id, 'violation');
    await expect(user.getComments(post.id)).resolves.not.toContain(comment);
  });
});
```

## Performance Metrics

| Feature | Target | Test Method |
|---------|--------|-------------|
| Feed load (cached) | < 500ms | API response time |
| Feed load (cold) | < 2s | DB + cache time |
| Image upload | < 3s | Upload + processing |
| Story load | < 1s | CDN fetch time |
| Reel upload | < 10s | Upload + transcode |

## Test Data Seeds
```typescript
// seeds/instagram-seed.ts
export const seedInstagramData = async () => {
  const users = await userFactory.buildList(100);
  const posts = await postFactory.buildList(1000);
  const stories = await storyFactory.buildList(500);
  const reels = await reelFactory.buildList(200);
  
  // Generate interactions
  for (const user of users) {
    await likeFactory.buildList(10, { userId: user.id });
    await commentFactory.buildList(5, { userId: user.id });
  }
};
```