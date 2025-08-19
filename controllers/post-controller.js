const mongoose = require('mongoose');
const Post = require('../models/postSchema.js');
const Like = require('../models/post/likeSchema.js');
const Comment = require('../models/post/commentSchema.js');
const Question = require('../models/questionSchema.js');
const Share = require('../models/post/shareSchema.js');
const User = require('../models/userSchema.js');
const Admin = require('../models/adminSchema.js');
const Notification = require('../models/notificationSchema'); // Import Notification model
const { incrementTotalPosts } = require('./global-controller.js');

const origin = process.env.ORIGIN;
//console.log('origin: ', origin);

const getUsername = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid userId');
  }

  const user = await User.findById(userId).select('username');

  if (!user) {
    throw new Error('User not found');
  }

  return user.username;
};



// Controller to handle adding a viewer to a post
const addViewerToPost = async (req, res) => {
  try { 
    const { postId } = req.params;
    const { userId } = req.body;
    let  username = await getUsername(userId);
    // Update the post by adding the userId to the viewers array
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $addToSet: { viewers: userId } },
      { new: true }
    );

    if (!updatedPost) {
      return res.status(404).json({
        message: 'Post not found',
      });
    }

    // Create notification for post author
    const postAuthor = updatedPost.author;
    const notificationMessage = `${username} viewed your post.`;
    const notification = new Notification({
      recipient: postAuthor,
      sender: userId,
      type: 'view',
      message: notificationMessage,
      link: `${origin}/postViewer/${postId}`
    });
    await notification.save();

    console.log('updated post and notification', updatedPost, notification);

    res.status(200).json({ data: updatedPost
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      message: 'Failed to add viewer to post',
      error: error.message,
    });
  }
};

// Controller to handle adding a like to a post
const addLikeToPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, type, message } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid postId or userId' });
    }

    // Fetch username
    const username = await getUsername(userId);

    // Create and save new Like
    const newLike = new Like({ userId: new mongoose.Types.ObjectId(userId), postId: new mongoose.Types.ObjectId(postId) });
    await newLike.save();
    //console.log('Like saved');

    // Find the post
    const updatedPost = await Post.findById(postId);
    if (!updatedPost) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Ensure likes field is an array
    if (!Array.isArray(updatedPost.likes)) {
      updatedPost.likes = [];
    }

    // Add new like to the array
    updatedPost.likes.push(userId);

    // Save updated post
    await updatedPost.save();

    // Create notification for post author
    const postAuthor = updatedPost.author;
    const notificationMessage = `${username} liked your post.`;
    const notification = new Notification({
      recipient: postAuthor,
      sender: userId,
      type: type,
      message: notificationMessage,
      link: `${origin}/postViewer/${postId}`
    });
    await notification.save();

    res.status(200).json({
      message: 'Like added successfully',
      post: updatedPost,
    });
  } catch (error) {
    //console.log('Error adding like:', error);
    res.status(500).json({
      message: 'Failed to add like to post',
      error: error.message,
    });
  }
};

// Controller for getting newest posts
const getNewestPosts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    if (isNaN(limit) || limit <= 0) {
      return res.status(400).json({ message: 'Invalid limit' });
    }
    
    const newestPosts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
      
    res.status(200).json({ data: newestPosts });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve newest posts',
      error: error.message,
    });
  }
};


// Controller to handle adding a comment to a post
const addCommentToPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, content } = req.body;

    //console.log('Adding comment', req.body);

    // Fetch username
    const username = await getUsername(userId);

    const newComment = new Comment({ author: userId, postId, content });
    await newComment.save();

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $addToSet: { comments: newComment._id } },
      { new: true }
    );
   // console.log('comment saved');

    // Create notification for post author
    const postAuthor = updatedPost.author;
    const notificationMessage = `${username} commented on your post.`;
    const notification = new Notification({
      recipient: postAuthor,
      sender: userId,
      type: 'comment',
      message: notificationMessage,
      link: `${origin}/postViewer/${postId}`
    });
    await notification.save();
    //console.log('comment notification saved');

    newComment.author=null;
    res.status(200).json({
      message: 'Comment added successfully',
      newComment: newComment,
      name:username
    });
  } catch (error) {
   // console.log('Error adding comment:', error);
    res.status(500).json({
      message: 'Failed to add comment to post',
      error: error.message,
    });
  }
};

// Controller to handle adding a share to a post
const addShareToPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    // Fetch username
    const username = await getUsername(userId);

    const newShare = new Share({ userId, postId });
    await newShare.save();

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $addToSet: { 'reactions.shares': newShare._id } },
      { new: true }
    );

    // Create notification for post author
    const postAuthor = updatedPost.author;
    const notificationMessage = `${username} shared your post.`;
    const notification = new Notification({
      recipient: postAuthor,
      sender: userId,
      message: notificationMessage,
      link: `${origin}/postViewer/${postId}`
    });
    await notification.save();

    res.status(200).json({
      message: 'Share added successfully',
      post: updatedPost,
    });
  } catch (error) {
   // console.log('Error adding share:', error);
    res.status(500).json({
      message: 'Failed to add share to post',
      error: error.message,
    });
  }
};

// Controller to handle creating a new post
const createPost = async (req, res) => {
  try {
    const { author, content, media, tags, title } = req.body;

   

    // Create a new post instance
    const newPost = new Post({
      author,
      title,
      content,
      media,
      tags,
    });

    // Save the post to the database
    const savedPost = await newPost.save();

   

    // Increment the total posts in system metrics
    incrementTotalPosts();

    

    res.status(200).json({
      message: 'Post created successfully',
      post: savedPost,
    });
  } catch (error) {
    //console.log(error);
    res.status(500).json({
      message: 'Failed to create post',
      error: error.message,
    });
  }
};

// Controller to retrieve all posts
const getAllPosts = async (req, res) => {
  const { adminId } = req.body; // extract adminId directly from body



  try {


    // Check if the adminId exists in the Admin schema
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.status(403).json({
        message: 'Unauthorized: Admin not found',
      });
    }

    // Fetch all posts, populate the 'author' field with user details
    const posts = await Post.find().populate('author', 'username email');

    if (!posts || posts.length === 0) {
      return res.status(404).json({ message: 'No posts found' });
    }

    res.status(200).json({
 
      posts
    });
  } catch (error) {
    console.error('Failed to retrieve posts:', error);
    res.status(500).json({
      message: 'Failed to retrieve posts',
      error: error.message,
    });
  }
};




const getPostById = async (req, res) => {
try {
const { postId } = req.params;

// Find a post by its unique ID
const post = await Post.findById(postId)
  .populate('author') // Populate the author field within the post
  .populate('comments.author') // Populate the author field within comments, if any
  .exec();

if (!post) {
  return res.status(404).json({
    message: 'Post not found',
  });
}

res.status(200).json( post);
} catch (error) {
//console.log(error);
res.status(500).json({
  message: 'Failed to retrieve post',
  error: error.message,
});
}
};



// Controller to retrieve comments for a post
const getCommentsForPost = async (req, res) => {
try {
const { postId } = req.params;

// Find the post by its ID and populate the comments field with user IDs
const comments = await Comment.find({ postId })
.populate('author', 'username profilePicture email verified') // Populate the author field with specific user data
.exec();

if (!comments) {
return res.status(404).json({ message: 'No comments found' });
}

//console.log('comments ', comments);
res.json(comments);
}
catch(error){
  //console.log(error);
  res.status(500).json({
    message: 'Failed to retrieve comments',
    error: error.message,
  });
}
}

const getNumberOfPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 30 } = req.query; // Pagination

    // Fetch the user's own posts
    let userPosts = await Post.find({ author: userId })
      .populate('author')
      .populate('comments.author')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

   console.log('userPosts', userPosts);
      res.status(200).json(userPosts.leng);

  } catch(err){
    console.log(err);
      res.status(500).json(err.message)
  }
}




// Controller to retrieve posts based on the current user ID and followers
const getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query; // Pagination

    // Fetch the user's own posts
    let userPosts = await Post.find({ author: userId })
      .populate('author')
      .populate('comments.author')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    let posts = [...userPosts];

    // Fetch user's followers' posts if user has few or no posts
    if (userPosts.length < limit) {
      const user = await User.findById(userId).populate('following'); // Changed to `following`
      
      if (user && user.following.length > 0) {
        const followingIds = user.following.map(following => following._id);

        const followingPosts = await Post.find({ author: { $in: followingIds } })
          .populate('author')
          .populate('comments.author')
          .limit(limit - userPosts.length) // Fetch enough posts to fill the limit
          .sort({ createdAt: -1 })
          .exec();

        posts = [...posts, ...followingPosts];
      }
    }

    // If still no posts, fallback to random global posts
    if (posts.length < limit) {
      const globalPosts = await Post.aggregate([
        { $sample: { size: limit - posts.length } }, // Random selection
        { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author' } },
        { $unwind: '$author' }, // Flatten the author array
      ]);

      posts = [...posts, ...globalPosts];
    }

    // Randomize the order of the final list of posts
    posts = posts.sort(() => Math.random() - 0.5);

    res.status(200).json({
      currentPage: page,
      totalPages: Math.ceil(posts.length / limit),
      posts,
    });
  } catch (error) {
    console.error('Error retrieving posts by user:', error);
    res.status(500).json({
      message: 'Failed to retrieve posts',
      error: error.message,
    });
  }
};

const getMostRecentPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 5 } = req.query; // Default limit set to 5 posts

    // Fetch the most recent posts by the user, sorted by createdAt descending
    const recentPosts = await Post.find({ author: userId })
      .populate('author') // Populate author details
      .populate('comments.author') // Populate comment authors
      .sort({ createdAt: -1 }) // Sort by most recent first
      .limit(limit * 1) // Convert limit to a number and apply it
      .exec();

    // Send the recent posts in response
    res.status(200).json({
      message: 'Most recent posts by user retrieved successfully',
      posts: recentPosts,
    });
  } catch (error) {
    console.error('Error retrieving most recent posts by user:', error);
    res.status(500).json({
      message: 'Failed to retrieve most recent posts',
      error: error.message,
    });
  }
};

// Function to delete all posts and associated data

// Controller to delete a post by postId, verifying adminId
const deletePost = async (req, res) => {
  const { adminId, postId } = req.body;
  //console.log('body',req.body);

 // console.log('deleting posts started')

  try {
    // Check if the adminId exists in the Admin schema
    const admin = await Admin.findById(adminId);
    
    if (!admin) {
      return res.status(403).json({
        message: 'Unauthorized: Admin not found',
      });
    }

    // Find the post by postId
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        message: 'Post not found',
      });
    }

    // Delete the post
    await Post.findByIdAndDelete(postId);

    res.status(200).json({
      message: 'Post deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete post:', error);
    res.status(500).json({
      message: 'Failed to delete post',
      error: error.message,
    });
  }
};


const getPosts = async (req, res) => {
  const { adminId } = req.body;

  try {
    // Check if the adminId exists in the Admin schema
    const admin = await Admin.findById(adminId);
    
    if (!admin) {
      return res.status(403).json({
        message: 'Unauthorized: Admin not found',
      });
    }

    // Find the post by postId
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        message: 'Post not found',
      });
    }

    // Delete the post
    await Post.findByIdAndDelete(postId);

    res.status(200).json({
      message: 'Post deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete post:', error);
    res.status(500).json({
      message: 'Failed to delete post',
      error: error.message,
    });
  }
};


const getTrendingQuestionsByTag = async (req, res) => {
  
  const { page = 1, limit = 1 } = req.query;
  const { tag } = req.params;
  const trimmedTag = tag.trim(); // Trim the tag for consistency
  const skip = (page - 1) * limit;

  try {
      console.log('Getting question data from database by tag:', trimmedTag);

      // Find questions with the specified tag
      const questions = await Question.find({ tags: trimmedTag })
          .populate('author')
          .sort({ createdAt: -1 }) // Sort by creation date
          .skip(skip)
          .limit(Number(limit));

      if (!questions || questions.length === 0) {
          return res.status(404).json({ message: 'No questions found' });
      }

      // Calculate the trending score for each question
      const trendingQuestions = questions.map(question => {
          const totalUpvotes = question.upvotes.length || 0;
          const totalDownvotes = question.downvotes.length || 0;
          const totalAnswers = question.answers.length || 0;
          const totalViews = question.views.length || 0;
          const totalReactions = totalUpvotes - totalDownvotes + totalAnswers + totalViews;

          const timeElapsedInHours = (new Date() - new Date(question.createdAt)) / (1000 * 60 * 60);

          const trendingScore = totalReactions / (timeElapsedInHours + 1);
          let recencyScore = -timeElapsedInHours * 0.5;

          if (timeElapsedInHours > 48) {
              recencyScore -= (timeElapsedInHours - 48) * 0.1;
          }

          recencyScore = Math.max(recencyScore, -trendingScore);

          return {
              ...question.toObject(),
              trendingScore: trendingScore + recencyScore,
              boostMultiplier: question.boosted ? 2 : 1,
          };
      });

      // Sort by total trending score
      trendingQuestions.sort((a, b) => (b.trendingScore * b.boostMultiplier) - (a.trendingScore * a.boostMultiplier));

      // Return questions with pagination info
      res.status(200).json({
          currentPage: page,
          totalPages: Math.ceil(await Question.countDocuments({ tags: trimmedTag }) / limit),
          questions: trendingQuestions,
      });
  } catch (error) {
    console.log(error);
      console.error('Error fetching trending questions:', error);
      res.status(500).json({ message: 'Failed to retrieve trending questions', error: error.message });
  }
};

const getTrendingQuestionsOverall2 = async (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const skip = (page - 1) * limit;

  try {
      console.log('Getting all question data from the database');
      console.log('Request Parameters:', req.query); // Log incoming request parameters

      // Fetch all questions without filtering by tags
      const questions = await Question.find()
          .populate('author')
          .sort({ createdAt: -1 }) // Sort by creation date
          .skip(skip)
          .limit(Number(limit));

      if (!questions || questions.length === 0) {
          return res.status(404).json({ message: 'No questions found' });
      }

      // Fisher-Yates shuffle algorithm for reliable randomness
      const shuffleArray = (array) => {
          for (let i = array.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [array[i], array[j]] = [array[j], array[i]];
          }
          return array;
      };

      // Shuffle questions array
      const randomQuestions = shuffleArray(questions.map(question => question.toObject()));

      // Return questions along with pagination info
      res.status(200).json({
          currentPage: page,
          totalPages: Math.ceil(await Question.countDocuments() / limit),
          questions: randomQuestions,
      });

  } catch (error) {
      console.error('Error fetching questions:', error);
      res.status(500).json({ message: 'Failed to retrieve questions', error: error.message });
  }
};




const getTrendingQuestionsOverall = async (req, res) => {
  const { page = 1, limit = 3 } = req.query;
  const skip = (page - 1) * limit;

  try {
      console.log('Getting all trending question data from the database');
      console.log('Request Parameters:', req.query); // Log incoming request parameters

      // Fetch all questions without filtering by tags
      const questions = await Question.find()
          .populate('author')
          .sort({ createdAt: -1 }) // Sort by creation date
          .skip(skip)
          .limit(Number(limit));

      if (!questions || questions.length === 0) {
          return res.status(404).json({ message: 'No questions found' });
      }

      // Calculate the trending score for each question
      const trendingQuestions = questions.map(question => {
          const totalUpvotes = question.upvotes.length || 0;
          const totalDownvotes = question.downvotes.length || 0;
          const totalAnswers = question.answers.length || 0;
          const totalViews = question.views.length || 0;
          const totalReactions = totalUpvotes - totalDownvotes + totalAnswers + totalViews;

          const timeElapsedInHours = (new Date() - new Date(question.createdAt)) / (1000 * 60 * 60);
          const trendingScore = totalReactions / (timeElapsedInHours + 1);
          let recencyScore = -timeElapsedInHours * 0.5;

          if (timeElapsedInHours > 48) {
              recencyScore -= (timeElapsedInHours - 48) * 0.1;
          }

          recencyScore = Math.max(recencyScore, -trendingScore);

          return {
              ...question.toObject(),
              trendingScore: trendingScore + recencyScore,
              boostMultiplier: question.boosted ? 2 : 1,
              timeElapsedInHours,
          };
      });

      // Sort by trending score initially
      trendingQuestions.sort((a, b) => (b.trendingScore * b.boostMultiplier) - (a.trendingScore * a.boostMultiplier));

      // Add randomness using array length for scaling
      const randomQuestions = trendingQuestions
          .map(question => ({
              ...question,
              randomFactor: question.timeElapsedInHours > 48 ? Math.random() * trendingQuestions.length : Math.random() * (trendingQuestions.length / 10),
          }))
          .sort((a, b) => 
              ((b.trendingScore * b.boostMultiplier) - b.randomFactor) - 
              ((a.trendingScore * a.boostMultiplier) - a.randomFactor)
          );

      // Return questions along with pagination info
      res.status(200).json({
          currentPage: page,
          totalPages: Math.ceil(await Question.countDocuments() / limit),
          questions: randomQuestions,
      });

  } catch (error) {
      console.error('Error fetching trending questions:', error);
      res.status(500).json({ message: 'Failed to retrieve trending questions', error: error.message });
  }
};





module.exports = { 
  createPost,
  getNumberOfPostsByUser,
  getMostRecentPostsByUser,
  getCommentsForPost,
  getPostById, 
  addViewerToPost, 
  addLikeToPost, 
  addCommentToPost, 
  addShareToPost, 
  getPostsByUser,
  getAllPosts,
  getPosts,
  deletePost,
  getNewestPosts,
  getTrendingQuestionsByTag,
  getTrendingQuestionsOverall,
  getTrendingQuestionsOverall2,
}
