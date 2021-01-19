import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Any, getConnection, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Podcast } from 'src/podcast/entities/podcast.entity';
import { Episode } from 'src/podcast/entities/episode.entity';

const GRAPHQL_ENDPOINT = '/graphql';

const testUser = {
  email: 'inzahani@yang.com',
  password: '12345',
};

describe('UserModule (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let podcastsRepository: Repository<Podcast>;
  let episodesRepository: Repository<Episode>;
  let jwtToken: string;

  const baseTest = () => request(app.getHttpServer()).post(GRAPHQL_ENDPOINT);
  const publicTest = (query: string) => baseTest().send({ query });
  const privateTest = (query: string) =>
    baseTest().set('X-JWT', jwtToken).send({ query });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    podcastsRepository = module.get<Repository<Podcast>>(
      getRepositoryToken(Podcast),
    );
    episodesRepository = module.get<Repository<Episode>>(
      getRepositoryToken(Episode),
    );
    await app.init();
  });
  afterAll(async () => {
    await getConnection().dropDatabase();
    app.close();
  });
  describe('createAccount', () => {
    it('should create account', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .send({
          query: `
          mutation {
            createAccount(input: {
              email:"${testUser.email}",
              password:"${testUser.password}",
              role:Listener
            }) {
              ok
              error
            }
          }
          `,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: { createAccount },
            },
          } = res;
          expect(createAccount.ok).toBe(true);
          expect(createAccount.error).toBe(null);
        });
    });

    it('should fail if account already exists', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .send({
          query: `
          mutation {
            createAccount(input: {
              email:"${testUser.email}",
              password:"${testUser.password}",
              role:Listener
            }) {
              ok
              error
            }
          }
          `,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: { createAccount },
            },
          } = res;
          expect(createAccount.ok).toBe(false);
          expect(createAccount.error).toBe(
            'There is a user with that email already',
          );
        });
    });
  });
  describe('login', () => {
    it('should login with correct credentials', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .send({
          query: `
            mutation {
              login(input: {
                email:"${testUser.email}",
                password:"${testUser.password}",
              }) {
                ok
                error
                token
              }
            }
          `,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: { login },
            },
          } = res;
          expect(login.ok).toBe(true);
          expect(login.error).toBe(null);
          expect(login.token).toEqual(expect.any(String));
          jwtToken = login.token;
        });
    });
    it('should not be able to login with wrong credentials', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .send({
          query: `mutation {
          login(input: {
            email:"${testUser.email}",
            password:"xxx",
          }) {
            ok
            error
            token
          }
        }`,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: { login },
            },
          } = res;
          expect(login.ok).toBe(false);
          expect(login.error).toBe('Wrong password');
          expect(login.token).toBe(null);
        });
    });
  });
  describe('userProfile', () => {
    let userId: number;
    beforeAll(async () => {
      const [user] = await userRepository.find();
      userId = user.id;
    });
    it("should see a user's profile", () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .set('X-JWT', jwtToken)
        .send({
          query: `{
          seeProfile(userId:${userId}){
            ok
            error
            user{
              id
            }
          }
        }`,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                seeProfile: {
                  ok,
                  error,
                  user: { id },
                },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
          expect(id).toBe(userId);
        });
    });
    it('should not find a profile', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .set('X-JWT', jwtToken)
        .send({
          query: `{
          seeProfile(userId:666){
            ok
            error
            user{
              id
            }
          }
        }`,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                seeProfile: { ok, error, user },
              },
            },
          } = res;
          expect(ok).toBe(false);
          expect(error).toBe('User Not Found');
          expect(user).toBe(null);
        });
    });
  });
  describe('me', () => {
    it('should find my profile', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .set('X-JWT', jwtToken)
        .send({
          query: `
          {
            me{
              email
            }
          }
        `,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                me: { email },
              },
            },
          } = res;
          expect(email).toBe(testUser.email);
        });
    });
    it('should not allow logged out user', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .send({
          query: `
          {
            me{
              email
            }
          }
        `,
        })
        .expect(200)
        .expect(res => {
          const {
            body: { errors },
          } = res;
          const [error] = errors;
          expect(error.message).toBe('Forbidden resource');
        });
    });
  });
  describe('editProfile', () => {
    const NEW_EMAIL = 'inzahan@new.com';
    it('should change email', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .set('X-JWT', jwtToken)
        .send({
          query: `
          mutation {
            editProfile(input:{
              email:"${NEW_EMAIL}"
            }) {
              ok
              error
            }
          }
        `,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                editProfile: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });
    it('should have new email', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .set('X-JWT', jwtToken)
        .send({
          query: `
            {
              me {
                email
              }
            }
        `,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                me: { email },
              },
            },
          } = res;
          expect(email).toBe(NEW_EMAIL);
        });
    });
  });
  describe('createPodcast', () => {
    it('should create podcast', () => {
      return publicTest(
        `mutation {
          createPodcast(input:{
            title:"hello"
            category:"hihihi"
          }) {
            ok
            error
            id
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                createPodcast: { ok, error, id },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
          expect(id).toBe(1);
        });
    });
  });
  describe('getAllPodcasts', () => {
    it('should show all podcasts', () => {
      return request(app.getHttpServer())
        .post(GRAPHQL_ENDPOINT)
        .send({
          query: `{
          getAllPodcasts {
            ok
            error
            podcasts {
              id
            }
          }
        }`,
        })
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                getAllPodcasts: { ok, error, podcasts },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
          expect(podcasts).toEqual([{ id: 1 }]);
        });
    });
  });
  describe('getPodcast', () => {
    let podcastId: number;
    beforeAll(async () => {
      const [podcast] = await podcastsRepository.find();
      podcastId = podcast.id;
    });
    it('should get podcast with id', () => {
      return publicTest(
        `
        {
          getPodcast(input:{
            id:${podcastId}
          }){
            ok
            error
            podcast{
              id
            }
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                getPodcast: {
                  ok,
                  error,
                  podcast: { id },
                },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
          expect(id).toBe(podcastId);
        });
    });
  });
  describe('updatePodcast', () => {
    it('should update podcast title', () => {
      return publicTest(
        `mutation {
          updatePodcast(input:{
            id:1
            payload:{title:"updated title"}
          }) {
            ok
            error
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                updatePodcast: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });
  });
  describe('createEpisode', () => {
    let podcastId: number;
    beforeAll(async () => {
      const [podcast] = await podcastsRepository.find();
      podcastId = podcast.id;
    });
    it('should create episode', () => {
      return publicTest(
        `mutation {
          createEpisode(input:{
            title:"episode title"
            category:"episode good"
            podcastId:${podcastId}
          }){
            ok
            error
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                createEpisode: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });
  });
  describe('getEpisodes', () => {
    let podcastId: number;
    beforeAll(async () => {
      const [podcast] = await podcastsRepository.find();
      podcastId = podcast.id;
    });
    it('should get Episode by id', () => {
      return publicTest(
        `
        {
          getEpisodes(input:{id:${podcastId}}){
            ok
            error
            episodes {
              id
            }
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                getEpisodes: { ok, error, episodes },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });
  });
  describe('updateEpisode', () => {
    let podcastId: number;
    let episodeId: number;
    beforeAll(async () => {
      const [podcast] = await podcastsRepository.find();
      podcastId = podcast.id;
      const [episode] = await episodesRepository.find();
      episodeId = episode.id;
    });
    it('should update episode', () => {
      return publicTest(
        `
        mutation {
          updateEpisode(input:{
            podcastId:${podcastId}
            episodeId:${episodeId}
            title:"episode updated"
          }) {
            ok
            error
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                updateEpisode: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });
  });
  describe('deleteEpisode', () => {
    let podcastId: number;
    let episodeId: number;
    beforeAll(async () => {
      const [podcast] = await podcastsRepository.find();
      podcastId = podcast.id;
      const [episode] = await episodesRepository.find();
      episodeId = episode.id;
    });
    it('should delete by id', () => {
      return publicTest(
        `mutation {
          deleteEpisode(input:{
            podcastId:${podcastId}
            episodeId:${episodeId}
          }){
            ok
            error
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                deleteEpisode: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });
  });
  describe('deletePodcast', () => {
    let podcastId: number;
    beforeAll(async () => {
      const [podcast] = await podcastsRepository.find();
      podcastId = podcast.id;
    });
    it('should podcast delete by id', () => {
      return publicTest(
        `
        mutation {
          deletePodcast(input:{
            id:${podcastId}
          }){
            ok
            error
          }
        }`,
      )
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                deletePodcast: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });
  });
});
