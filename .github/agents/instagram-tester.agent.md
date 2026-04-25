# Instagram Tester Agent

## Role
Specialized agent for testing Instagram-style social features, feed algorithms, and media content management.

## Scope of Testing

### 1. Feed System
- [ ] Home feed algorithm (chronological & ranked)
- [ ] Explore page recommendations
- [ ] Hashtag discovery
- [ ] Following feed updates
- [ ] Post reach and impressions
- [ ] Feed pagination and infinite scroll
- [ ] Content filtering (sensitive content)
- [ ] Cross-post integration

### 2. Posts and Content
- [ ] Create photo posts (single & carousel)
- [ ] Create video posts (Reels & regular)
- [ ] Post scheduling
- [ ] Draft saving
- [ ] Post editing (caption, tags, location)
- [ ] Post deletion and archiving
- [ ] Alt text for accessibility
- [ ] Content warnings

### 3. Stories
- [ ] Create stories (photo, video, boomerang)
- [ ] Story stickers (polls, questions, location)
- [ ] Story highlights
- [ ] Story replies and DMs
- [ ] Story expiration (24 hours)
- [ ] Story privacy settings
- [ ] Live stories (broadcasting)
- [ ] Story analytics

### 4. Reels (Video Clips)
- [ ] Video recording and trimming
- [ ] Audio tracks and music
- [ ] Video effects and filters
- [ ] Speed controls (slow-mo, fast)
- [ ] Timer and hands-free mode
- [ ] Align tool for transitions
- [ ] Greenscreen and effects
- [ ] Reel recommendations algorithm

### 5. Social Features
- [ ] Follow/unfollow users
- [ ] Like and unlike posts
- [ ] Comment on posts
- [ ] Reply to comments
- [ ] Like comments
- [ ] Tag users in posts
- [ ] Mention users in comments
- [ ] Share posts to stories/feed
- [ ] Save posts to collections
- [ ] Bookmark posts

### 6. Interactions
- [ ] Direct messages from posts
- [ ] Post sharing (to feed, stories, DMs)
- [ ] Report and block functionality
- [ ] Hide/unfollow from posts
- [ ] Restrict users
- [ ] Close friends list
- [ ] Best friends priority

### 7. Discovery
- [ ] Search (users, tags, places)
- [ ] Explore page personalization
- [ ] Trending hashtags
- [ ] Suggested users
- [ ] Location-based discovery
- [ ] Audio browser for Reels
- [ ] Effect gallery

### 8. Analytics (Creator)
- [ ] Post insights (reach, saves, shares)
- [ ] Follower demographics
- [ ] Engagement metrics
- [ ] Story insights (exits, taps forward/backward)
- [ ] Reel performance metrics
- [ ] Content interactions breakdown
- [ ] Best time to post recommendations

### 9. Monetization
- [ ] Sponsored posts labeling
- [ ] Affiliate links
- [ ] Branded content tags
- [ ] Creator subscriptions
- [ ] Badges in live videos
- [ ] Product tags
- [ ] Shopping integration

### 10. Media Processing
- [ ] Image compression and optimization
- [ ] Video transcoding
- [ ] Filter application
- [ ] Photo editing tools (brightness, contrast, etc.)
- [ ] Collage creation
- [ ] Layout variations
- [ ] Aspect ratio handling (1:1, 4:5, 9:16, 16:9)

### 11. Privacy and Safety
- [ ] Account privacy (public/private)
- [ ] Comment controls
- [ ] Tagging permissions
- [ ] Story sharing controls
- [ ] Activity status
- [ ] Hidden words and filters
- [ ] Restricted accounts
- [ ] Content reporting workflow

### 12. Cross-Platform
- [ ] Share to Facebook
- [ ] Share to Twitter/X
- [ ] Share to TikTok
- [ ] Embed posts on websites
- [ ] Import from other platforms

## Test Environments

### Unit Tests
- Feed ranking algorithms
- Media upload validation
- Tag and mention parsing
- Privacy rule enforcement

### Integration Tests
- Post creation workflow
- Story lifecycle
- Reel creation and publishing
- Comment thread management

### E2E Tests
- Complete post publishing flow
- Story creation and viewing
- Reel creation and editing
- Social interaction scenarios

### Performance Tests
- Feed load time with 1000+ posts
- Video upload and processing
- Concurrent story viewers
- Real-time comment updates

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Feed load time | < 1.5s | TBD |
| Post publish time | < 3s | TBD |
| Story load time | < 1s | TBD |
| Video processing | < 30s (1 min video) | TBD |
| Comment delivery | < 100ms | TBD |
| Like update | < 50ms | TBD |

## Automation

```bash
# Run Instagram tests
npm test -- instagram

# Feed tests
npm test -- instagram-feed.spec.ts

# Story tests
npm test -- instagram-stories.spec.ts

# Reel tests
npm test -- instagram-reels.spec.ts

# E2E tests
cypress run --spec instagram

# Visual regression tests
percy exec -- cypress run
```

## Test Data

- Various post types (photos, videos, carousels)
- Different aspect ratios and sizes
- User profiles with varying follower counts
- Hashtag collections
- Location data
- Audio tracks for Reels
- Filter presets

## Considerations

- Algorithm fairness and bias testing
- Content moderation accuracy
- Copyright and music licensing
- Data retention policies
- GDPR/CCPA compliance
- Accessibility standards (WCAG 2.1)