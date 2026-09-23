# frozen_string_literal: true

RSpec.describe "SPC Critique Exchange" do
  fab!(:category) { Fabricate(:category) }
  fab!(:member) { Fabricate(:user) }
  fab!(:other_member) { Fabricate(:user) }
  fab!(:another_member) { Fabricate(:user) }

  before do
    SiteSetting.spc_critique_exchange_enabled = false
    SiteSetting.spc_critique_exchange_category_id = category.id
    PluginStore.remove("spc_critique_exchange", "started_at")
  end

  def create_image(user, title, category_id = category.id)
    PostCreator.create!(
      user,
      title: title,
      raw: "An image shared for constructive feedback: #{title}.",
      category: category_id,
    ).topic
  end

  def try_next_image
    creator =
      TopicCreator.new(
        member,
        Guardian.new(member),
        { title: "Another image for critique", category: category.id },
      )
    [creator.valid?, creator.errors.full_messages.join(" ")]
  end

  it "allows the first image, then requires replies on two distinct images by others" do
    create_image(member, "My image before activation")
    old_image = create_image(other_member, "Another image before activation")
    PostCreator.create!(member, topic_id: old_image.id, raw: "My critique before activation.")

    SiteSetting.spc_critique_exchange_enabled = true
    started_at = PluginStore.get("spc_critique_exchange", "started_at")
    expect(started_at).to be_present
    expect(try_next_image.first).to eq(true)

    own_image = create_image(member, "My first critique image")
    valid, message = try_next_image
    expect(valid).to eq(false)
    expect(message).to include("2")

    other_category = Fabricate(:category)
    unrelated = create_image(other_member, "An image in another category", other_category.id)
    create_image(member, "My image in another category", other_category.id)
    PostCreator.create!(member, topic_id: own_image.id, raw: "More context about my own photo.")
    PostCreator.create!(member, topic_id: unrelated.id, raw: "A reply outside Photo Feedback.")
    valid, message = try_next_image
    expect(valid).to eq(false)
    expect(message).to include("2")

    first = create_image(other_member, "First image from another member")
    second = create_image(another_member, "Second image from another member")
    PostCreator.create!(member, topic_id: first.id, raw: "Thoughtful feedback on the first image.")
    PostCreator.create!(member, topic_id: first.id, raw: "More thoughts on that same image.")
    valid, message = try_next_image
    expect(valid).to eq(false)
    expect(message).to include("1")

    PostCreator.create!(member, topic_id: second.id, raw: "Thoughtful feedback on the second image.")
    expect(try_next_image.first).to eq(true)

    create_image(member, "My second critique image")
    valid, message = try_next_image
    expect(valid).to eq(false)
    expect(message).to include("2")

    SiteSetting.spc_critique_exchange_enabled = false
    expect(try_next_image.first).to eq(true)
    SiteSetting.spc_critique_exchange_enabled = true
    expect(PluginStore.get("spc_critique_exchange", "started_at")).to eq(started_at)
    expect(try_next_image.first).to eq(false)
  end
end
